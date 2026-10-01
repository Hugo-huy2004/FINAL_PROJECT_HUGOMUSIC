import { getSocket } from '../utils/socket';

// Đồng bộ giờ với server kiểu NTP rút gọn (Cristian): gửi ping, server trả giờ của nó;
// lệch giờ = giờ server + RTT/2 − giờ máy lúc nhận. Lấy vài mẫu và giữ mẫu có RTT nhỏ
// nhất — mẫu đó ít bị hàng đợi mạng làm sai nhất (sai số tối đa ±RTT/2).
let offsetMs = 0;

export const serverNow = () => Date.now() + offsetMs;

export async function syncClock(samples = 8): Promise<void> {
  let best = Infinity;
  for (let i = 0; i < samples; i++) {
    const sent = Date.now();
    const server = await new Promise<number | null>((resolve) =>
      getSocket().timeout(3000).emit('clock:ping', (err: unknown, t: number) => resolve(err ? null : t)),
    );
    const received = Date.now();
    if (server === null) continue;
    const rtt = received - sent;
    if (rtt < best) {
      best = rtt;
      offsetMs = server + rtt / 2 - received;
    }
  }
}
