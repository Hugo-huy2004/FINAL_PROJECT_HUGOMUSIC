const Song = require('../modules/songs/Song');
const PipelineRun = require('./PipelineRun');
const { NO_DERIVATIVE } = require('../modules/songs/songReview');
const SourceAudio = require('./SourceAudio');

// Coordinate tasks (Jobs) on songs. Two ways to run:
// runSong(id) — entire string for ONE post (when admin approves): write each step to PipelineRun in DB,
// An error in one step does not block the next step (eg, if the PSL fails, the HLS is still built using the speculative scale).
// runBatch(job) — a job for all items that are still needed (compensate for the whole store), printing progress to the screen.
// The original audio file loads once for every step needed (SourceAudio) and is always cleaned up after each lesson.
class Pipeline {
  constructor(jobs) {
    this.jobs = jobs;
  }

  // The ND license prohibits the creation of derivatives: any steps to create derivatives (HLS, PSL) are skipped.
  static allowed(job, song) {
    return job.allowNoDerivative || !NO_DERIVATIVE.includes(song.licenseType);
  }

  async runSong(songId, { trigger = 'approve', force = false, runId = null, onStage = null } = {}) {
    const song = await Song.findById(songId);
    if (!song) throw new Error(`không có bài ${songId}`);
    let run = null;
    if (runId) {
      run = await PipelineRun.findById(runId);
      if (run) {
        await PipelineRun.updateOne({ _id: run._id }, { status: 'running', startedAt: new Date() });
      }
    }
    if (!run) {
      run = await PipelineRun.create({
        song: song._id,
        trigger,
        status: 'running',
        stages: this.jobs.map((j) => ({ job: j.name })),
      });
    }
    const ctx = { audio: new SourceAudio(song), cache: new Map() };
    const setStage = async (i, fields) => {
      await PipelineRun.updateOne({ _id: run._id }, Object.fromEntries(
        Object.entries(fields).map(([k, v]) => [`stages.${i}.${k}`, v]),
      ));
      if (typeof onStage === 'function') {
        try { onStage({ runId: run._id, songId: song._id, stageIndex: i, job: this.jobs[i].name, ...fields }); } catch {}
      }
    };
    let failed = false;
    try {
      for (const [i, job] of this.jobs.entries()) {
        if (!Pipeline.allowed(job, song)) { await setStage(i, { status: 'skipped', note: 'giấy phép ND' }); continue; }
        if (!force && !job.needsRun(song)) { await setStage(i, { status: 'skipped', note: 'đã có' }); continue; }
        await setStage(i, { status: 'running', startedAt: new Date() });
        try {
          const note = await job.run(song, ctx);
          await setStage(i, { status: 'ok', note, finishedAt: new Date() });
        } catch (err) {
          failed = true;
          await setStage(i, { status: 'failed', note: String(err.message).split('\n')[0].slice(0, 500), finishedAt: new Date() });
        }
      }
    } finally {
      ctx.audio.cleanup();
      await PipelineRun.updateOne({ _id: run._id }, { status: failed ? 'failed' : 'ok', finishedAt: new Date() });
    }
    return run._id;
  }

  static async runBatch(job, { id, limit, redo = false, log = console.log } = {}) {
    let query = Song.find({
      ...job.pending({ redo }),
      ...(id && { _id: id }),
      ...(!job.allowNoDerivative && { licenseType: { $nin: NO_DERIVATIVE } }),
      filePath: /r2\.cloudflarestorage\.com/,
    }).select(`title filePath duration licenseType status ${job.select}`);
    if (limit) query = query.limit(limit);
    const songs = await query;
    const cache = new Map();
    let ok = 0;
    for (const [i, song] of songs.entries()) {
      const ctx = { audio: new SourceAudio(song), cache };
      try {
        const note = await job.run(song, ctx);
        ok += 1;
        log(`[${i + 1}/${songs.length}] "${song.title.slice(0, 40)}" ${note}`);
      } catch (err) {
        log(`[${i + 1}/${songs.length}] LỖI "${song.title.slice(0, 40)}": ${String(err.message).split('\n')[0]}`);
      } finally {
        ctx.audio.cleanup();
      }
    }
    log(`Xong ${job.name}: ${ok}/${songs.length} bài`);
    return { ok, total: songs.length };
  }
}

module.exports = Pipeline;
