// Socket.IO event directory (realtime) — include GET /api/docs so the documentation page shows the realtime channel.
// Test yourself: node sockets/events.js — reads rooms/ and sockets/ source code, reports errors if there are events not described here,
// So the list cannot deviate from the code.
const SOCKET_EVENTS = [
  // client → server (with ack returning { error } if failed)
  { dir: 'client→server', name: 'clock:ping', auth: 'public', summary: 'NTP-style clock sync: ack(server time)', payload: '(ack)' },
  { dir: 'client→server', name: 'station:join', auth: 'user', summary: 'Join a 24/7 station and receive a state snapshot', payload: '{ id }' },
  { dir: 'client→server', name: 'station:suggest', auth: 'user', summary: 'Suggest a song for the station queue', payload: '{ id, songId }' },
  { dir: 'client→server', name: 'station:vote', auth: 'user', summary: 'Vote / unvote a queued song', payload: '{ id, entryId }' },
  { dir: 'client→server', name: 'station:remove', auth: 'user', summary: 'Remove your own suggestion (admins can remove any)', payload: '{ id, entryId }' },
  { dir: 'client→server', name: 'blind:join', auth: 'user', summary: 'Join a blind-listening room', payload: '{ id }' },
  { dir: 'client→server', name: 'blind:vote', auth: 'user', summary: 'Pick A / B / same for the current trial', payload: "{ id, trialId, choice: 'A' | 'B' | 'same' }" },
  { dir: 'client→server', name: 'room:leave', auth: 'user', summary: 'Leave the current listening room', payload: '—' },
  { dir: 'client→server', name: 'join_room', auth: 'user', summary: 'Join the sync space shared by your own devices', payload: "'workspace:<userId>'" },
  { dir: 'client→server', name: 'play_sync', auth: 'user', summary: 'Broadcast a new timeline anchor to your other devices', payload: '{ roomId, songId, pos, at, playing, queue, queueIndex }' },
  { dir: 'client→server', name: 'leave_room', auth: 'user', summary: 'Leave the sync space', payload: "'workspace:<userId>'" },
  { dir: 'client→server', name: 'disconnecting', auth: 'public', summary: '(Socket.IO internal) update listener counts on disconnect', payload: '—' },
  // server → client
  { dir: 'server→client', name: 'station:state', summary: 'Station state: current song (server time), queue, listeners', payload: '{ station, now, queue, listeners, serverTime }' },
  { dir: 'server→client', name: 'room:closed', summary: 'An admin hid or deleted the room — leave it', payload: '{ kind, id }' },
  { dir: 'server→client', name: 'blind:trial', summary: 'New blind trial: the A/B pair and its start time', payload: 'public trial (never reveals which version is higher quality)' },
  { dir: 'server→client', name: 'blind:votes', summary: 'How many listeners voted in the current trial', payload: '{ trialId, voted, listeners }' },
  { dir: 'server→client', name: 'blind:reveal', summary: 'Reveal: which version was A/B, vote tally, leaderboard', payload: '{ trialId, a, b, control, tally, correct, leaderboard, nextDifficulty }' },
  { dir: 'server→client', name: 'blind:listeners', summary: 'Listeners in the blind-listening room', payload: '{ count }' },
  { dir: 'server→client', name: 'blind:closing', summary: 'Voting closed for the current trial; the reveal is next', payload: '{ trialId, voteUntil, revealUntil }' },
  { dir: 'server→client', name: 'blind:error', summary: 'Blind-listening room error', payload: '{ message }' },
  { dir: 'server→client', name: 'room_state', summary: 'Latest timeline anchor of the sync space (sent on join)', payload: 'same as play_sync' },
  { dir: 'server→client', name: 'sync_playback', summary: 'Another device changed song, seeked or paused', payload: 'same as play_sync' },
  { dir: 'server→client', name: 'room_members', summary: 'Devices currently in the sync space', payload: '{ roomId, count }' },
];

module.exports = { SOCKET_EVENTS };

if (require.main === module) {
  const fs = require('fs');
  const path = require('path');
  const assert = require('assert');
  const files = ['modules/rooms', 'sockets'].flatMap((d) => fs.readdirSync(path.join(__dirname, '..', d)).filter((f) => f.endsWith('.js')).map((f) => path.join(__dirname, '..', d, f)));
  const used = new Set();
  for (const f of files) for (const m of fs.readFileSync(f, 'utf8').matchAll(/(?:socket\.on|\.emit)\('([a-z_:]+)'/g)) used.add(m[1]);
  const listed = new Set(SOCKET_EVENTS.map((e) => e.name));
  const missing = [...used].filter((e) => !listed.has(e));
  const stale = [...listed].filter((e) => !used.has(e));
  assert.deepStrictEqual(missing, [], `Sự kiện chưa mô tả trong sockets/events.js: ${missing.join(', ')}`);
  assert.deepStrictEqual(stale, [], `Sự kiện đã bỏ khỏi code nhưng còn trong danh mục: ${stale.join(', ')}`);
  const notEnglish = SOCKET_EVENTS.filter((e) => /[À-ỹđĐ]/.test(`${e.summary} ${e.payload}`)).map((e) => e.name);
  assert.deepStrictEqual(notEnglish, [], 'socket event docs must be in English (they are shown on the API page)');
  console.log(`socket events self-check: ok (${listed.size} events)`);
}
