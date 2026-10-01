const { client } = require('../../config/redis');

// Guests who are not logged in can listen to GUEST_FREE_SONGS in full, DIFFERENT songs every day (by IP), next song
// must be logged in (songController.getPlaybackToken). Counting in SERVER, in Redis: after the scaler
// By loading each request, the token may fall into a different instance — if counted in RAM, the customer gets it
// N × 3 cards. Check-then-write must be atomic (Lua) so that two instances do not both pass "still have a turn".
// Many people sharing the same IP (NAT) share the same limit.
const GUEST_FREE_SONGS = 3;
const GUEST_WINDOW_MS = 24 * 60 * 60 * 1000;

const SCRIPT = `
if redis.call('SISMEMBER', KEYS[1], ARGV[1]) == 1 then return 1 end
if redis.call('SCARD', KEYS[1]) >= tonumber(ARGV[2]) then return 0 end
redis.call('SADD', KEYS[1], ARGV[1])
if redis.call('PTTL', KEYS[1]) < 0 then redis.call('PEXPIRE', KEYS[1], ARGV[3]) end
return 1`;

/** Can guests at `ip` listen to `songId`? If you listen to the calculated song again, your turn will not be deducted. */
async function guestMayPlay(ip, songId, windowMs = GUEST_WINDOW_MS) {
  const ok = await client.eval(SCRIPT, {
    keys: [`guest:${ip}`],
    arguments: [String(songId), String(GUEST_FREE_SONGS), String(windowMs)],
  });
  return ok === 1;
}

module.exports = { guestMayPlay, GUEST_FREE_SONGS };

if (require.main === module) {
  const assert = require('assert');
  (async () => {
    const ip = `selfcheck-${process.pid}`;
    const other = `${ip}-b`;
    for (const id of ['s1', 's2', 's3']) assert.strictEqual(await guestMayPlay(ip, id), true);
    assert.strictEqual(await guestMayPlay(ip, 's4'), false, 'bài thứ 4 phải đăng nhập');
    assert.strictEqual(await guestMayPlay(ip, 's2'), true, 'nghe lại / xin token mới giữa bài không trừ lượt');
    assert.strictEqual(await guestMayPlay(other, 's4'), true, 'đếm riêng từng IP');
    // 10 parallel requests from the same new client (simulating multiple instances): exactly 3 posts passed.
    const race = `${ip}-race`;
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => guestMayPlay(race, `r${i}`)));
    assert.strictEqual(results.filter(Boolean).length, GUEST_FREE_SONGS, 'kiểm tra-rồi-ghi phải nguyên tử');
    // When the time frame expires, recalculate (50 ms frame instead of 24 h).
    const win = `${ip}-win`;
    for (const id of ['a', 'b', 'c']) await guestMayPlay(win, id, 50);
    assert.strictEqual(await guestMayPlay(win, 'd', 50), false);
    await new Promise((r) => setTimeout(r, 80));
    assert.strictEqual(await guestMayPlay(win, 'd', 50), true, 'sang khung mới thì tính lại');
    await client.del([`guest:${ip}`, `guest:${other}`, `guest:${race}`, `guest:${win}`]);
    console.log('guestQuota self-check: ok');
    await client.quit();
  })().catch((e) => { console.error(e); process.exit(1); });
}
