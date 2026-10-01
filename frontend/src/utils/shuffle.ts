// Fisher–Yates: mọi hoán vị đồng xác suất (sort(() => Math.random() - 0.5) thì không —
// bài đầu danh sách hay bị giữ gần đầu).
export function shuffled<T>(list: T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
