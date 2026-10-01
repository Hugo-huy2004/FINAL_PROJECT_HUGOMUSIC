const Job = require('../Job');
const { runAnalyzer } = require('../python');

// Đo thang bitrate PSL (ViSQOL) — điểm bão hoà chất lượng cảm nhận của CHÍNH bài này (docs/PSL_TECHNIQUE.md).
// HlsJob đọc song.pslLadder để biết cần dựng những mức nào.
// Phải trùng CODEC trong analyzers/psl_measure.py và bộ mã hoá của HlsJob.
const PSL_CODEC = 'aac';

class PslJob extends Job {
  constructor() {
    super({ name: 'psl', label: 'Đo thang chất lượng (PSL)', needsAudio: true, select: 'pslLadder pslCodec' });
  }

  // Lọc theo pslCodec chứ không theo pslLadder: bài mới có sẵn mảng rỗng [], bài đo bằng MP3 phải đo lại.
  pending({ redo } = {}) { return redo ? { status: 'published' } : { status: 'published', pslCodec: { $ne: PSL_CODEC } }; }

  needsRun(song) { return song.pslCodec !== PSL_CODEC; }

  async run(song, ctx) {
    const r = runAnalyzer('psl_measure.py', [await ctx.audio.path()], 30 * 60 * 1000);
    if (r.codec !== PSL_CODEC) throw new Error(`psl_measure đo bằng ${r.codec}, cần ${PSL_CODEC}`);
    Object.assign(song, { pslLadder: r.ladder, pslMos: r.mos, pslTau: r.tau, pslCodec: r.codec, pslMeasuredAt: new Date() });
    await song.save();
    return `nguồn ${r.declaredKbps}k → thang ${r.ladder.join('/') || '(chỉ tệp gốc)'} · tiết kiệm ${r.savedPct}%`;
  }
}

module.exports = PslJob;
module.exports.PSL_CODEC = PSL_CODEC;
