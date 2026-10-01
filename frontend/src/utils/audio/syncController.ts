// Bộ điều khiển khớp nhịp (thuần tính toán, không phụ thuộc máy phát → mô phỏng/kiểm được:
// node scripts/check-sync.mjs). Mỗi PERIOD_MS nhận độ lệch đo được (giây, > 0 = máy này đi trước)
// và trả lời: tua về đúng chỗ, hoặc phát với tốc độ bao nhiêu.
//
// Cam kết: segment HLS đầu (4 s) được phép lệch, từ segment thứ 2 mọi máy lệch < 20 ms và giữ ở đó.
//  - Pha bắt kịp: lệch > SEEK_ABOVE_S thì tua (bù thời gian nạp — timelineSync.ts); lệch nhỏ hơn thì
//    đổi tốc độ tới ±FAST_MAX để khép trong khoảng HORIZON_S.
//  - Pha khoá nhịp: lệch < LOCK_S thì chỉ chỉnh ±LOCK_MAX (giữ cao độ, gần như không nghe ra);
//    dưới DEADBAND_S coi như khớp, phát đúng tốc độ.
// Số đo được làm mượt nhẹ (trung bình trượt) để một lần đọc vị trí nhiễu không làm chỉnh oan.
export const SYNC = {
  PERIOD_MS: 250,
  SEEK_ABOVE_S: 0.35,
  LOCK_S: 0.03,
  DEADBAND_S: 0.005,
  FAST_MAX: 0.1,
  LOCK_MAX: 0.02,
  HORIZON_S: 1,
  SMOOTH: 0.5, // trọng số của số đo mới
};

export type SyncCtl = { filtered: number | null };
export const newSyncCtl = (): SyncCtl => ({ filtered: null });

export type SyncAction = { seek: true } | { seek: false; rate: number };

export function controlStep(ctl: SyncCtl, drift: number): SyncAction {
  if (Math.abs(drift) > SYNC.SEEK_ABOVE_S) {
    ctl.filtered = null;
    return { seek: true };
  }
  const f = ctl.filtered === null ? drift : ctl.filtered * (1 - SYNC.SMOOTH) + drift * SYNC.SMOOTH;
  ctl.filtered = f;
  if (Math.abs(f) < SYNC.DEADBAND_S) return { seek: false, rate: 1 };
  const cap = Math.abs(f) < SYNC.LOCK_S ? SYNC.LOCK_MAX : SYNC.FAST_MAX;
  const delta = Math.max(-cap, Math.min(cap, -f / SYNC.HORIZON_S));
  return { seek: false, rate: 1 + delta };
}
