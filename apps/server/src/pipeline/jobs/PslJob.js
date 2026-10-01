const Job = require('../Job');
const { runAnalyzer } = require('../python');

// Measures the PSL bitrate scale (ViSQOL) — the perceived quality saturation point of this OWN article (docs/PSL_TECHNIQUE.md).
// HlsJob reads song.pslLadder to know which levels to build.
// Must match the CODEC in analyzers/psl_measure.py and HlsJob's encoder.
const PSL_CODEC = 'aac';

class PslJob extends Job {
  constructor() {
    super({ name: 'psl', label: 'Đo thang chất lượng (PSL)', needsAudio: true, select: 'pslLadder pslCodec' });
  }

  // Filter by pslCodec, not pslLadder: the new song has an empty array [], the song measured in MP3 must be measured again.
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
