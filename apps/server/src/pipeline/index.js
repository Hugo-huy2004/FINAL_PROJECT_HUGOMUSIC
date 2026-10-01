// List of tasks + running sequence when admin approves post. Add new task: write a class that inherits Job in
// jobs/, register in JOBS, and (if needed to run while browsing) add APPROVAL in the correct order of dependencies.
const Pipeline = require('./Pipeline');
const ReleaseJob = require('./jobs/ReleaseJob');
const PslJob = require('./jobs/PslJob');
const TransitionJob = require('./jobs/TransitionJob');
const HlsJob = require('./jobs/HlsJob');
const GlobalStatsJob = require('./jobs/GlobalStatsJob');

const JOBS = Object.fromEntries([new ReleaseJob(), new PslJob(), new TransitionJob(), new HlsJob(), new GlobalStatsJob()].map((j) => [j.name, j]));

// Order: release info/cover art + global figures (no files needed) → PSL (HLS needs PSL ladder) → transfer → HLS.
const APPROVAL = ['release', 'global', 'psl', 'transition', 'hls'];
const approvalPipeline = () => new Pipeline(APPROVAL.map((n) => JOBS[n]));

module.exports = { JOBS, APPROVAL, approvalPipeline, Pipeline };
