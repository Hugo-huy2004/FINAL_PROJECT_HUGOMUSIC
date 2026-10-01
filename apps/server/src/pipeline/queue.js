// Audio Pipeline Queue — Hugo Music
// Resolve resource bottlenecks: limit the number of heavy tasks (ViSQOL/FFmpeg) running concurrently.
// Dual mode support: Persistent Redis List (if Redis is available) + Automatic In-Memory Fallback.
const mongoose = require('mongoose');
const PipelineRun = require('./PipelineRun');
const { JOBS, APPROVAL, approvalPipeline } = require('./index');
const { client: redis, isReady: redisReady } = require('../config/redis');

const REDIS_QUEUE_KEY = 'pipeline:queue';
const REDIS_ACTIVE_KEY = 'pipeline:active';

// By default, each article runs sequentially (concurrency = 1) to ensure stable CPU/RAM for the API server.
const CONCURRENCY = Math.max(1, Number(process.env.PIPELINE_CONCURRENCY || 1));

// In-memory fallback
const memoryQueue = [];
const memoryActive = new Set();

let activeWorkers = 0;
let workerRunning = false;
let progressListeners = [];

function onProgress(fn) {
  progressListeners.push(fn);
  return () => {
    progressListeners = progressListeners.filter((l) => l !== fn);
  };
}

function notifyProgress(payload) {
  for (const fn of progressListeners) {
    try { fn(payload); } catch {}
  }
}

/**
 * Push a song into the processing queue.
 * @param {string|mongoose.Types.ObjectId} songId
 * @param {object} [options] { trigger: 'approve'|'retry'|'cli', force: boolean }
 * @returns {Promise<{ ok: boolean, queued: boolean, runId: string, message?: string }>}
 */
async function enqueueSong(songId, { trigger = 'approve', force = false } = {}) {
  const sId = String(songId);

  // 1. Deduplication: Check if the post is waiting or running
  if (memoryActive.has(sId)) {
    return { ok: false, queued: false, message: 'Bài đang nằm trong hàng đợi xử lý' };
  }

  const existingActive = await PipelineRun.findOne({
    song: sId,
    status: { $in: ['queued', 'running'] },
  }).select('_id status').lean();

  if (existingActive) {
    return {
      ok: false,
      queued: false,
      runId: String(existingActive._id),
      message: `Bài đã có tiến trình xử lý (${existingActive.status})`,
    };
  }

  // 2. Create PipelineRun record in 'queued' state
  const run = await PipelineRun.create({
    song: sId,
    trigger,
    status: 'queued',
    stages: APPROVAL.map((name) => ({
      job: name,
      status: 'pending',
    })),
  });

  const payload = {
    songId: sId,
    runId: String(run._id),
    trigger,
    force: !!force,
    enqueuedAt: Date.now(),
  };

  // 3. Push to Redis or In-Memory
  if (redisReady()) {
    try {
      await redis.rPush(REDIS_QUEUE_KEY, JSON.stringify(payload));
      await redis.sAdd(REDIS_ACTIVE_KEY, sId);
    } catch (err) {
      console.warn('[pipeline:queue] Redis push failed, fallback to memory queue:', err.message);
      memoryQueue.push(payload);
      memoryActive.add(sId);
    }
  } else {
    memoryQueue.push(payload);
    memoryActive.add(sId);
  }

  notifyProgress({ type: 'queued', songId: sId, runId: String(run._id) });

  // 4. Activate the worker if it is idle
  scheduleTick();

  return { ok: true, queued: true, runId: String(run._id) };
}

/**
 * Get the next job from the queue.
 */
async function popNextJob() {
  if (redisReady()) {
    try {
      const raw = await redis.lPop(REDIS_QUEUE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (err) {
      console.warn('[pipeline:queue] Redis pop failed, check memory queue:', err.message);
    }
  }
  return memoryQueue.shift() || null;
}

/**
 * Process the next task if there are concurrency slots available.
 */
async function scheduleTick() {
  if (!workerRunning || activeWorkers >= CONCURRENCY) return;

  const job = await popNextJob();
  if (!job) return;

  activeWorkers++;
  processJob(job).finally(() => {
    activeWorkers--;
    scheduleTick();
  });
}

/**
 * Run the actual processing for a song.
 */
async function processJob({ songId, runId, trigger, force }) {
  const sId = String(songId);
  try {
    notifyProgress({ type: 'start', songId: sId, runId });

    await approvalPipeline().runSong(sId, {
      trigger,
      force,
      runId,
      onStage: (stageEvent) => {
        notifyProgress({ type: 'stage', songId: sId, runId, ...stageEvent });
      },
    });

    notifyProgress({ type: 'complete', songId: sId, runId, status: 'ok' });
  } catch (err) {
    console.error(`[pipeline:queue] Lỗi khi xử lý bài ${sId}:`, err.message);
    await PipelineRun.updateOne(
      { _id: runId },
      { status: 'failed', finishedAt: new Date() }
    ).catch(() => {});
    notifyProgress({ type: 'complete', songId: sId, runId, status: 'failed', error: err.message });
  } finally {
    if (redisReady()) {
      await redis.sRem(REDIS_ACTIVE_KEY, sId).catch(() => {});
    }
    memoryActive.delete(sId);
  }
}

/**
 * Start background processing workers.
 */
async function startQueueWorker() {
  if (workerRunning) return;
  workerRunning = true;
  console.log(`[pipeline:queue] Worker started (concurrency=${CONCURRENCY})`);

  // Recover previously 'queued' songs (if server is restarted)
  try {
    const stranded = await PipelineRun.find({ status: 'queued' })
      .sort({ createdAt: 1 })
      .select('song trigger')
      .lean();

    for (const item of stranded) {
      const sId = String(item.song);
      if (!memoryActive.has(sId)) {
        memoryQueue.push({
          songId: sId,
          runId: String(item._id),
          trigger: item.trigger || 'approve',
          force: false,
          enqueuedAt: Date.now(),
        });
        memoryActive.add(sId);
      }
    }
    if (stranded.length) {
      console.log(`[pipeline:queue] Re-enqueued ${stranded.length} stranded job(s)`);
    }
  } catch {}

  scheduleTick();
}

/**
 * Graceful shutdown of workers.
 */
async function stopQueueWorker() {
  workerRunning = false;
  // Wait up to 5 seconds for unfinished tasks
  const start = Date.now();
  while (activeWorkers > 0 && Date.now() - start < 5000) {
    await new Promise((r) => setTimeout(r, 200));
  }
}

/**
 * Get status data of the queue.
 */
async function getQueueStats() {
  let redisLen = 0;
  if (redisReady()) {
    try { redisLen = await redis.lLen(REDIS_QUEUE_KEY); } catch {}
  }
  return {
    concurrency: CONCURRENCY,
    activeWorkers,
    queuedCount: redisLen + memoryQueue.length,
    isRunning: workerRunning,
  };
}

module.exports = {
  enqueueSong,
  startQueueWorker,
  stopQueueWorker,
  getQueueStats,
  onProgress,
  CONCURRENCY,
};
