// Chọn backend cho bộ cân bằng tải của Hugo Music — thuần tính toán, không I/O, kiểm được bằng
// `node lb/lb.test.js`. Bốn thuật toán để so sánh trong thí nghiệm (docs/EXPERIMENTS.md):
//
//   random       — mốc so sánh: chọn ngẫu nhiên.
//   round-robin  — lần lượt từng bản. Đều về SỐ request, bỏ qua việc request nào nặng/nhẹ.
//   least-conn   — bản đang xử lý ít request nhất. Tốt khi thời gian xử lý chênh nhau (stream nhạc
//                  giữ kết nối hàng phút cạnh request JSON vài ms).
//   p2c-ewma     — "power of two choices" + độ trễ trượt (peak EWMA, như Finagle/Linkerd): bốc ngẫu
//                  nhiên 2 bản, lấy bản có (độ trễ × (đang xử lý + 1)) nhỏ hơn. Chỉ cần 2 phép so sánh
//                  mà gần tối ưu (Mitzenmacher 2001), và tự tránh bản đang chậm dần trước khi nó chết.
//
// Mỗi pool một chế độ: 'balance' (chia tải) hoặc 'failover' (luôn dùng bản khoẻ đầu tiên theo thứ tự —
// cho tầng realtime, nơi trạng thái đài/phòng chỉ nằm ở một tiến trình).
//
// Hai lớp phát hiện bản hỏng:
//   - chủ động: health checker gọi /healthz định kỳ, `rise` lần đạt mới lên, `fall` lần trượt mới xuống.
//   - thụ động (outlier ejection / circuit breaker): `ejectAfter` lỗi kết nối liên tiếp → loại tạm thời,
//     thời gian loại tăng gấp đôi mỗi lần tái phạm (tối đa ejectMaxMs), như Envoy.

const EWMA_ALPHA = 0.3;

function createBackend(addr) {
  const [host, port] = addr.split(':');
  return {
    addr, host, port: Number(port),
    up: true,            // theo health check chủ động; bắt đầu "lên" để không 503 lúc khởi động
    hcOk: 0, hcFail: 0,  // chuỗi đạt/trượt liên tiếp của health check
    inflight: 0,         // request/kết nối đang xử lý
    ewmaMs: 0,           // độ trễ tới header phản hồi (TTFB), trượt
    errors: 0,           // lỗi kết nối liên tiếp (thụ động)
    ejections: 0, ejectedUntil: 0,
    requests: 0, failures: 0, // tổng, cho /__lb/stats
  };
}

function createPool(name, addrs, { mode = 'balance', algo = 'p2c-ewma', rise = 2, fall = 2, ejectAfter = 3, ejectBaseMs = 5000, ejectMaxMs = 60000, rand = Math.random } = {}) {
  return { name, mode, algo, rise, fall, ejectAfter, ejectBaseMs, ejectMaxMs, rand, rr: 0, backends: addrs.map(createBackend) };
}

const available = (pool, now) => pool.backends.filter((b) => b.up && b.ejectedUntil <= now);

// Điểm của p2c-ewma. Bản chưa có số đo (ewmaMs = 0) coi như nhanh nhất để được thử.
const cost = (b) => (b.ewmaMs || 1) * (b.inflight + 1);

/** Chọn một backend, bỏ qua những bản trong `exclude` (đã thử và lỗi trong lần retry này). */
function pick(pool, { exclude = new Set(), now = Date.now() } = {}) {
  const list = available(pool, now).filter((b) => !exclude.has(b));
  if (!list.length) return null;
  if (pool.mode === 'failover') return list[0];
  switch (pool.algo) {
    case 'random':
      return list[Math.floor(pool.rand() * list.length)];
    case 'round-robin':
      return list[pool.rr++ % list.length];
    case 'least-conn': {
      const min = Math.min(...list.map((b) => b.inflight));
      const ties = list.filter((b) => b.inflight === min);
      return ties[Math.floor(pool.rand() * ties.length)];
    }
    case 'p2c-ewma': {
      if (list.length === 1) return list[0];
      const i = Math.floor(pool.rand() * list.length);
      let j = Math.floor(pool.rand() * (list.length - 1));
      if (j >= i) j += 1; // hai bản KHÁC nhau
      return cost(list[i]) <= cost(list[j]) ? list[i] : list[j];
    }
    default:
      throw new Error(`Thuật toán không hỗ trợ: ${pool.algo}`);
  }
}

// Peak EWMA: số đo tăng thì nhận ngay (phản ứng nhanh khi bản bắt đầu chậm), giảm thì trượt từ từ.
function recordLatency(b, ms) {
  b.ewmaMs = b.ewmaMs === 0 || ms > b.ewmaMs ? ms : b.ewmaMs * (1 - EWMA_ALPHA) + ms * EWMA_ALPHA;
}

function recordSuccess(b) {
  b.errors = 0;
}

/** Lỗi kết nối/502 từ backend. Trả true nếu bản này vừa bị loại tạm thời. */
function recordFailure(pool, b, now = Date.now()) {
  b.failures += 1;
  b.errors += 1;
  if (b.errors < pool.ejectAfter) return false;
  b.errors = 0;
  b.ejectedUntil = now + Math.min(pool.ejectMaxMs, pool.ejectBaseMs * 2 ** b.ejections);
  b.ejections += 1;
  return true;
}

/** Kết quả một lần health check chủ động. Trả 'up' | 'down' khi trạng thái đổi, null nếu không. */
function recordHealth(pool, b, ok) {
  if (ok) {
    b.hcFail = 0;
    b.hcOk += 1;
    if (!b.up && b.hcOk >= pool.rise) {
      b.up = true;
      b.ejections = 0; // khoẻ lại thật sự → xoá "tiền án"
      b.ejectedUntil = 0;
      return 'up';
    }
  } else {
    b.hcOk = 0;
    b.hcFail += 1;
    if (b.up && b.hcFail >= pool.fall) {
      b.up = false;
      return 'down';
    }
  }
  return null;
}

module.exports = { createPool, pick, recordLatency, recordSuccess, recordFailure, recordHealth, available };
