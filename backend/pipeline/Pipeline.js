const Song = require('../models/Song');
const PipelineRun = require('../models/PipelineRun');
const { NO_DERIVATIVE } = require('../utils/songReview');
const SourceAudio = require('./SourceAudio');

// Điều phối các tác vụ (Job) trên bài hát. Hai cách chạy:
//   runSong(id)   — cả chuỗi cho MỘT bài (khi admin duyệt): ghi từng bước vào PipelineRun trong DB,
//                   một bước lỗi không chặn bước sau (vd. PSL lỗi thì HLS vẫn dựng bằng thang suy đoán).
//   runBatch(job) — một tác vụ cho mọi bài còn cần (chạy bù cả kho), in tiến độ ra màn hình.
// Tệp âm thanh gốc tải một lần cho mọi bước cần (SourceAudio) và luôn được dọn sau mỗi bài.
class Pipeline {
  constructor(jobs) {
    this.jobs = jobs;
  }

  // Giấy phép ND cấm tạo bản phái sinh: bước nào tạo bản phát (HLS, PSL) thì bỏ qua.
  static allowed(job, song) {
    return job.allowNoDerivative || !NO_DERIVATIVE.includes(song.licenseType);
  }

  async runSong(songId, { trigger = 'approve', force = false } = {}) {
    const song = await Song.findById(songId);
    if (!song) throw new Error(`không có bài ${songId}`);
    const run = await PipelineRun.create({
      song: song._id,
      trigger,
      stages: this.jobs.map((j) => ({ job: j.name })),
    });
    const ctx = { audio: new SourceAudio(song), cache: new Map() };
    const setStage = (i, fields) => PipelineRun.updateOne({ _id: run._id }, Object.fromEntries(
      Object.entries(fields).map(([k, v]) => [`stages.${i}.${k}`, v]),
    ));
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
