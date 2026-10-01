// Ngày gõ tay 'DD/MM/YYYY' (hoặc chỉ 8 chữ số) → 'YYYY-MM-DD'; null nếu chưa đủ, ngày không có thật,
// trước 1900 hoặc sau `max` (mặc định hôm nay). Tự kiểm: node scripts/check-date.mjs
export function parseDmy(text: string, max = new Date()): string | null {
  const d = text.replace(/\D/g, '');
  if (d.length !== 8) return null;
  const [day, month, year] = [+d.slice(0, 2), +d.slice(2, 4), +d.slice(4)];
  const date = new Date(Date.UTC(year, month - 1, day));
  const real = date.getUTCDate() === day && date.getUTCMonth() === month - 1 && year >= 1900;
  return real && date <= max ? date.toISOString().slice(0, 10) : null;
}

// Gõ số → tự chèn dấu '/': '0102' → '01/02', '01022000' → '01/02/2000'.
export const maskDmy = (text: string) => {
  const d = text.replace(/\D/g, '').slice(0, 8);
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4)].filter(Boolean).join('/');
};
