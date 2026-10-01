const Job = require('../Job');
const { runAnalyzer } = require('../python');

// Seamless transition data: start/end silence cut, loudness (volume balance), intro/outro, beat + beat
// (analyzers/transition_analyze.py). Frontend used in utils/audio/transitionPlan.ts.
// Only read/measure files, do not create derivatives → can also run with ND license.
const TRANSITION_VERSION = 1; // must match VERSION in transition_analyze.py; increases when changing algorithms

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
