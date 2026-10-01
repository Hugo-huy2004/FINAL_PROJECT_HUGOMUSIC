const assert = require('assert');
const { client: redis } = require('../config/redis');
const {
  enqueueSong,
  startQueueWorker,
  stopQueueWorker,
  getQueueStats,
  onProgress,
  CONCURRENCY,
} = require('./queue');

async function testQueue() {
  // 1. Verify structure & exports
  assert.strictEqual(typeof enqueueSong, 'function');
  assert.strictEqual(typeof startQueueWorker, 'function');
  assert.strictEqual(typeof stopQueueWorker, 'function');
  assert.strictEqual(typeof getQueueStats, 'function');
  assert.strictEqual(typeof onProgress, 'function');
  assert.ok(CONCURRENCY >= 1, 'concurrency must be at least 1');

  // 2. Queue stats shape
  const stats = await getQueueStats();
  assert.strictEqual(typeof stats.concurrency, 'number');
  assert.strictEqual(typeof stats.activeWorkers, 'number');
  assert.strictEqual(typeof stats.queuedCount, 'number');
  assert.strictEqual(typeof stats.isRunning, 'boolean');

  // 3. Listener registration and unregistration
  const events = [];
  const unsubscribe = onProgress((e) => events.push(e));
  assert.strictEqual(typeof unsubscribe, 'function');
  unsubscribe();

  console.log('✓ apps/server/src/pipeline/queue.test.js passed');
  await redis.quit().catch(() => {});
  process.exit(0);
}

testQueue().catch((err) => {
  console.error('Queue test failed:', err);
  process.exit(1);
});
