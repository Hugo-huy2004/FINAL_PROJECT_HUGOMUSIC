// Hand type date 'DD/MM/YYYY' (or just 8 digits) → 'YYYY-MM-DD'; null if not enough, date is not real,
// before 1900 or after `max` (default today). Check yourself: node scripts/check-date.mjs
export function parseDmy(text: string, max = new Date()): string | null {
  const d = text.replace(/\D/g, '');
  if (d.length !== 8) return null;
  const [day, month, year] = [+d.slice(0, 2), +d.slice(2, 4), +d.slice(4)];
  const date = new Date(Date.UTC(year, month - 1, day));
  const real = date.getUTCDate() === day && date.getUTCMonth() === month - 1 && year >= 1900;
  return real && date <= max ? date.toISOString().slice(0, 10) : null;
}

// Type a number → manually insert a '/' sign: '0102' → 'February 1', '01022000' → 'February 1, 2000'.
export const maskDmy = (text: string) => {
  const d = text.replace(/\D/g, '').slice(0, 8);
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4)].filter(Boolean).join('/');
};
