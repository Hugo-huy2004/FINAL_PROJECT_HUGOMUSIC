// Design tokens:
//  - 44 × 44 pt minimum touch target (WCAG 2.5.5)
//  - a type ramp from Large Title 34 to Caption 12 that scales with the system text size
//  - a 4-pt spacing grid
export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;
export const radius = { sm: 6, md: 10, lg: 14, xl: 20, xxl: 28, pill: 999 } as const;
export const TOUCH = 44;
/** Horizontal content margin on phones. */
export const GUTTER = 18;

export const type = {
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: '800' as const, letterSpacing: -0.7 },
  title1: { fontSize: 28, lineHeight: 34, fontWeight: '800' as const, letterSpacing: -0.5 },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '800' as const, letterSpacing: -0.35 },
  title3: { fontSize: 20, lineHeight: 25, fontWeight: '700' as const, letterSpacing: -0.3 },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' as const },
  body: { fontSize: 17, lineHeight: 22, fontWeight: '400' as const },
  callout: { fontSize: 16, lineHeight: 21, fontWeight: '400' as const },
  subhead: { fontSize: 15, lineHeight: 20, fontWeight: '400' as const },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' as const },
};

// Saturated colour pairs; white bold text stays readable on every one of them.
const GRADIENTS: [string, string][] = [
  ['#FF375F', '#FF9F0A'], ['#5E5CE6', '#BF5AF2'], ['#0A84FF', '#5AC8FA'], ['#30D158', '#0A84FF'],
  ['#FF9F0A', '#FFD60A'], ['#BF5AF2', '#FF375F'], ['#64D2FF', '#5E5CE6'], ['#FF453A', '#AC2B24'],
];

/** A stable two-colour gradient for a key: the same key always gives the same colours. */
export function gradientFor(key: string): [string, string] {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return GRADIENTS[Math.abs(h) % GRADIENTS.length];
}
