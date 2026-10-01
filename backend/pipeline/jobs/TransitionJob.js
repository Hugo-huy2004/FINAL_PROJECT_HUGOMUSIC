const Job = require('../Job');
const { runAnalyzer } = require('../python');

// Dữ liệu chuyển bài liền mạch: cắt im lặng đầu/cuối, độ to (cân âm lượng), intro/outro, nhịp + phách
// (analyzers/transition_analyze.py). Frontend dùng ở utils/audio/transitionPlan.ts.
// Chỉ đọc/đo tệp, không tạo bản phái sinh → chạy được cả với giấy phép ND.
const TRANSITION_VERSION = 1; // phải trùng VERSION trong transition_analyze.py; tăng khi đổi thuật toán

class TransitionJob extends Job {
  constructor() {
    super({ name: 'transition', label: 'Phân tích chuyển bài', needsAudio: true, allowNoDerivative: true, select: 'transition' });
  }

  pending({ redo } = {}) {
    return redo ? { status: 'published' } : { status: 'published', 'transition.version': { $ne: TRANSITION_VERSION } };
  }

  needsRun(song) { return song.transition?.version !== TRANSITION_VERSION; }

  async run(song, ctx) {
    const { duration, ...fields } = runAnalyzer('transition_analyze.py', [await ctx.audio.path()], 10 * 60 * 1000);
    song.transition = { ...fields, analyzedAt: new Date() };
    await song.save();
    const bpm = fields.bpm && fields.beatConfidence >= 0.2 ? `${Math.round(fields.bpm)} BPM` : 'nhịp không rõ';
    return `im đầu ${fields.trimStart}s, im cuối ${(duration - fields.trimEnd).toFixed(2)}s · ${fields.lufs ?? '?'} LUFS · ${bpm}`;
  }
}

module.exports = TransitionJob;
