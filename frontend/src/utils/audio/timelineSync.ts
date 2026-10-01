import { Platform } from 'react-native';
import { audioEngine } from '../audioEngine';
import { controlStep, newSyncCtl } from './syncController';

export { SYNC } from './syncController';

// Giữ máy này bám theo MỘT dòng thời gian chung (vị trí đáng lẽ phải ở, tính theo giờ server) — dùng
// cho đài 24/7 (src/rooms/useRooms.ts) và đồng bộ nhiều máy cùng tài khoản (store/useStore.ts).
//
// Mỗi SYNC.PERIOD_MS đo lệch rồi hỏi bộ điều khiển (syncController.ts — đã mô phỏng: từ giây thứ 4,
// tức hết segment HLS đầu, các máy lệch nhau < 20 ms) nên tua hay chỉnh tốc độ bao nhiêu.

const sleep = (ms: number) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

// "Chi phí vào nhạc" của CHÍNH máy này: từ lúc ra lệnh phát/tua tới lúc tiếng thật sự chạy (xin token,
// tải đoạn HLS, bộ đệm AVPlayer/ExoPlayer...). Web vài trăm ms, điện thoại qua mạng di động có khi
// 1–3 s. Học dần sau mỗi lần phát/tua (trung bình trượt) rồi vào VƯỢT lên đúng chừng đó, để lúc tiếng
// cất lên là khớp luôn.
let catchUpS = Platform.OS === 'web' ? 0.4 : 1.2;
let busy = false;
const ctl = newSyncCtl();
let rateTouched = false; // đã đổi tốc độ phát → nhớ trả về 1 khi thôi bám

async function learnCatchUp(target: number, issuedAt: number) {
  const deadline = issuedAt + 10000;
  while (Date.now() < deadline) {
    await sleep(100);
    const p = await audioEngine.getPosition();
    // Vị trí đã chạy qua điểm đích ⇒ tiếng bắt đầu lúc (bây giờ − quãng đã phát).
    if (p !== null && p > target + 0.15 && p < target + 3) {
      const cost = (Date.now() - issuedAt) / 1000 - (p - target);
      if (cost > 0 && cost < 8) catchUpS = catchUpS * 0.6 + cost * 0.4;
      return;
    }
  }
}

// Bắt đầu phát sao cho lúc tiếng cất lên là đúng `expected()`: `start(pos)` nạp/tua rồi phát tại `pos`.
export async function startAligned(expected: () => number, start: (pos: number) => Promise<unknown>) {
  busy = true;
  ctl.filtered = null; // bài/điểm mới: số đo cũ không còn ý nghĩa
  try {
    const issuedAt = Date.now();
    const target = Math.max(0, expected() + catchUpS);
    await start(target);
    await learnCatchUp(target, issuedAt);
  } finally {
    busy = false;
  }
}

// Đo lệch so với `expected()` rồi sửa (tua hoặc đổi tốc độ). Trả về độ lệch đo được (giây, > 0 là
// máy này đi trước), null nếu lúc này chưa đo được. Gọi đều mỗi SYNC.PERIOD_MS.
export async function alignTo(expected: () => number): Promise<number | null> {
  if (busy) return null;
  const actual = await audioEngine.getPosition();
  if (actual === null) return null;
  const drift = actual - expected();
  const action = controlStep(ctl, drift);
  if (action.seek) {
    await releaseRate();
    await startAligned(expected, (pos) => audioEngine.seek(pos));
  } else {
    rateTouched = action.rate !== 1;
    await audioEngine.setRate(action.rate);
  }
  return drift;
}

// Thôi bám dòng thời gian (dừng, rời phòng, tắt đồng bộ): phát lại đúng tốc độ gốc.
export async function releaseRate() {
  ctl.filtered = null;
  if (!rateTouched) return;
  rateTouched = false;
  await audioEngine.setRate(1);
}
