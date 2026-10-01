// Color widget for cover art interface (album page, player): color from song.coverColor
// (one-time server — apps/server/src/pipeline/jobs/ReleaseJob.js).
const parse = (hex: string) => {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
};
const toHex = (rgb: number[]) => `#${rgb.map((c) => Math.round(Math.max(0, Math.min(1, c)) * 255).toString(16).padStart(2, '0')).join('')}`;

// Relative Brightness (WCAG) — determines whether text is black or white on a background of that color.
function luminance(hex: string) {
  const lin = parse(hex).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}
export const isLight = (hex: string) => luminance(hex) > 0.35;

// Blend towards black (amount < 0) or white (amount > 0), 0..1.
export function shade(hex: string, amount: number) {
  const target = amount < 0 ? 0 : 1;
  return toHex(parse(hex).map((c) => c + (target - c) * Math.abs(amount)));
}

export const withAlpha = (hex: string, alpha: number) => {
  const [r, g, b] = parse(hex).map((c) => Math.round(c * 255));
  return `rgba(${r},${g},${b},${alpha})`;
};

export const isHexColor = (v?: string): v is string => !!v && /^#[0-9a-f]{6}$/i.test(v);
