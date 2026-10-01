// Danh mục sự kiện Socket.IO (realtime) — trả kèm GET /api/docs để trang tài liệu hiện cả kênh realtime.
// Tự kiểm: node sockets/events.js — đọc mã nguồn rooms/ và sockets/, báo lỗi nếu có sự kiện chưa mô tả ở đây,
// nên danh mục không thể lệch khỏi code.
const SOCKET_EVENTS = [
  // client → server (có ack trả { error } nếu thất bại)
  { dir: 'client→server', name: 'clock:ping', auth: 'public', summary: 'Đồng bộ giờ kiểu NTP: ack(giờ server)', payload: '(ack)' },
  { dir: 'client→server', name: 'station:join', auth: 'user', summary: 'Vào kênh 24/7, nhận ảnh chụp trạng thái', payload: '{ id }' },
  { dir: 'client→server', name: 'station:suggest', auth: 'user', summary: 'Đề xuất bài vào hàng chờ của kênh', payload: '{ id, songId }' },
  { dir: 'client→server', name: 'station:vote', auth: 'user', summary: 'Bầu / bỏ bầu một bài trong hàng chờ', payload: '{ id, entryId }' },
  { dir: 'client→server', name: 'station:remove', auth: 'user', summary: 'Gỡ bài mình đề xuất (admin gỡ được mọi bài)', payload: '{ id, entryId }' },
  { dir: 'client→server', name: 'blind:join', auth: 'user', summary: 'Vào phòng nghe mù', payload: '{ id }' },
  { dir: 'client→server', name: 'blind:vote', auth: 'user', summary: 'Chọn A / B / như nhau cho lượt nghe hiện tại', payload: "{ id, trialId, choice: 'A' | 'B' | 'same' }" },
  { dir: 'client→server', name: 'room:leave', auth: 'user', summary: 'Rời phòng nghe chung đang ở', payload: '—' },
  { dir: 'client→server', name: 'join_room', auth: 'user', summary: 'Vào không gian đồng bộ các thiết bị của chính mình', payload: "'workspace:<userId>'" },
  { dir: 'client→server', name: 'play_sync', auth: 'user', summary: 'Phát mốc dòng thời gian mới cho các thiết bị khác', payload: '{ roomId, songId, pos, at, playing, queue, queueIndex }' },
  { dir: 'client→server', name: 'leave_room', auth: 'user', summary: 'Rời không gian đồng bộ', payload: "'workspace:<userId>'" },
  { dir: 'client→server', name: 'disconnecting', auth: 'public', summary: '(nội bộ Socket.IO) cập nhật số người khi mất kết nối', payload: '—' },
  // server → client
  { dir: 'server→client', name: 'station:state', summary: 'Trạng thái kênh: bài đang phát (giờ server), hàng chờ, người nghe', payload: '{ station, now, queue, listeners, serverTime }' },
  { dir: 'server→client', name: 'room:closed', summary: 'Admin ẩn/xoá phòng — rời phòng', payload: '{ kind, id }' },
  { dir: 'server→client', name: 'blind:trial', summary: 'Lượt nghe mù mới: hai bản A/B và mốc giờ phát', payload: 'trial công khai (không lộ bản nào chất lượng cao)' },
  { dir: 'server→client', name: 'blind:votes', summary: 'Số người đã chọn trong lượt hiện tại', payload: '{ trialId, voted, listeners }' },
  { dir: 'server→client', name: 'blind:reveal', summary: 'Công bố đáp án: bản nào ở A/B, thống kê lựa chọn, bảng điểm', payload: '{ trialId, a, b, control, tally, correct, leaderboard, nextDifficulty }' },
  { dir: 'server→client', name: 'blind:listeners', summary: 'Số người đang trong phòng nghe mù', payload: '{ count }' },
  { dir: 'server→client', name: 'blind:closing', summary: 'Hết giờ chọn của lượt hiện tại, sắp công bố đáp án', payload: '{ trialId, voteUntil, revealUntil }' },
  { dir: 'server→client', name: 'blind:error', summary: 'Lỗi của phòng nghe mù', payload: '{ message }' },
  { dir: 'server→client', name: 'room_state', summary: 'Mốc dòng thời gian cuối của không gian đồng bộ (khi vừa vào)', payload: 'như play_sync' },
  { dir: 'server→client', name: 'sync_playback', summary: 'Thiết bị khác vừa đổi bài/tua/dừng', payload: 'như play_sync' },
  { dir: 'server→client', name: 'room_members', summary: 'Số thiết bị đang trong không gian đồng bộ', payload: '{ roomId, count }' },
];

module.exports = { SOCKET_EVENTS };

if (require.main === module) {
  const fs = require('fs');
  const path = require('path');
  const assert = require('assert');
  const files = ['rooms', 'sockets'].flatMap((d) => fs.readdirSync(path.join(__dirname, '..', d)).filter((f) => f.endsWith('.js')).map((f) => path.join(__dirname, '..', d, f)));
  const used = new Set();
  for (const f of files) for (const m of fs.readFileSync(f, 'utf8').matchAll(/(?:socket\.on|\.emit)\('([a-z_:]+)'/g)) used.add(m[1]);
  const listed = new Set(SOCKET_EVENTS.map((e) => e.name));
  const missing = [...used].filter((e) => !listed.has(e));
  const stale = [...listed].filter((e) => !used.has(e));
  assert.deepStrictEqual(missing, [], `Sự kiện chưa mô tả trong sockets/events.js: ${missing.join(', ')}`);
  assert.deepStrictEqual(stale, [], `Sự kiện đã bỏ khỏi code nhưng còn trong danh mục: ${stale.join(', ')}`);
  console.log(`socket events self-check: ok (${listed.size} sự kiện)`);
}
