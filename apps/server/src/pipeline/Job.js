// General contract of a post processing task in the pipeline. Each task (jobs/*) is a separate class,
// keep its logic; Pipeline only knows this contract, so adding/modifying/removing a task does not impact other tasks.
//
// name The name used in the CLI and in PipelineRun (e.g. 'psl')
// label display name for admin
// needsAudio needs the original audio file (SourceAudio downloads it ONCE for every need)
// allowNoDerivative works with ND license (read/measure only, no derivatives for playback)
// select the Song Task fields to read
// pending(opts) Mongo filter: which songs still need to be run (used when running in bulk)
// needsRun(song) same condition for ONE article (used when reviewing articles)
// run(song, ctx) work + save to song; Returns a line describing the result
class Job {
  constructor({ name, label, needsAudio = false, allowNoDerivative = false, select = '' }) {
    Object.assign(this, { name, label, needsAudio, allowNoDerivative, select });
  }

  // eslint-disable-next-line no-unused-vars
  pending(opts) { throw new Error(`${this.name}: pending() not implemented`); }

  // eslint-disable-next-line no-unused-vars
  needsRun(song) { throw new Error(`${this.name}: needsRun() not implemented`); }

  // eslint-disable-next-line no-unused-vars
  async run(song, ctx) { throw new Error(`${this.name}: run() not implemented`); }

  // Test the pure logic of the task yourself (no need for DB/network). By default there is nothing to check.
  selfCheck() {}
}

module.exports = Job;
