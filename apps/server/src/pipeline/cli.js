// Run the pipeline manually:
// node pipeline/cli.js approve --id=<songId> [--force] the entire string for a song (as in approval; record PipelineRun)
//   node pipeline/cli.js <release|psl|transition|hls> [--id=<songId>] [--limit=N] [--redo]
// one task for all items that are still needed (make up for the whole warehouse)
// node pipeline/cli.js --self-check checks the pure logic of every task
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { JOBS, APPROVAL, approvalPipeline, Pipeline } = require('./index');

const arg = (name) => (process.argv.find((a) => a.startsWith(`--${name}=`)) || '').split('=')[1];
const flag = (name) => process.argv.includes(`--${name}`);

async function main() {
  if (flag('self-check')) {
    for (const job of Object.values(JOBS)) job.selfCheck();
    require('../ranking/score').selfCheck();
    console.log(`pipeline self-check: ok (${Object.keys(JOBS).join(', ')})`);
    return;
  }
  const command = process.argv[2];
  const mongoose = require('mongoose');
  const connectDB = require('../config/db');
  await connectDB();
  try {
    if (command === 'worker') {
      const { startQueueWorker, stopQueueWorker } = require('./queue');
      await startQueueWorker();
      console.log('Worker is listening for pipeline jobs. Press Ctrl+C to stop.');
      process.on('SIGINT', async () => {
        console.log('Stopping worker...');
        await stopQueueWorker();
        await mongoose.disconnect();
        process.exit(0);
      });
      await new Promise(() => {});
    } else if (command === 'approve') {
      if (!arg('id')) throw new Error('approve cần --id=<songId>');
      const runId = await approvalPipeline().runSong(arg('id'), { trigger: arg('trigger') || 'cli', force: flag('force') });
      const run = await require('./PipelineRun').findById(runId).lean();
      for (const s of run.stages) console.log(`${s.job.padEnd(10)} ${s.status.padEnd(8)} ${s.note}`);
    } else if (JOBS[command]) {
      await Pipeline.runBatch(JOBS[command], { id: arg('id'), limit: Number(arg('limit')) || undefined, redo: flag('redo') });
    } else {
      throw new Error(`Không rõ lệnh "${command}". Dùng: approve | worker | ${Object.keys(JOBS).join(' | ')} | --self-check (chuỗi duyệt: ${APPROVAL.join(' → ')})`);
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => { console.error(err.message); process.exit(1); });
