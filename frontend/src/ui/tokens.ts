// Token thiết kế của Hugo Music — một nguồn duy nhất cho khoảng cách, bo góc, cỡ chữ,
// vùng chạm và bảng màu gradient. Theo Apple Human Interface Guidelines:
//  - vùng chạm tối thiểu 44×44 pt (HIG "Layout" / WCAG 2.5.5);
//  - thang chữ Dynamic Type mặc định của iOS (Large Title 34 … Caption 12);
//  - lưới khoảng cách bội số 4.
export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;
export const radius = { sm: 6, md: 10, lg: 14, xl: 20, xxl: 28, pill: 999 } as const;
export const TOUCH = 44;
export const GUTTER = 18; // lề trái/phải của nội dung trên điện thoại

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

// Gradient nhiều màu — cặp màu hệ thống của Apple, luôn đủ tương phản cho chữ trắng đậm.
const GRADIENTS: [string, string][] = [
  ['#FF375F', '#FF9F0A'], // hồng → cam
  ['#5E5CE6', '#BF5AF2'], // chàm → tím
  ['#0A84FF', '#5AC8FA'], // xanh dương
  ['#30D158', '#0A84FF'], // xanh lá → xanh dương
  ['#FF9F0A', '#FFD60A'], // cam → vàng
  ['#BF5AF2', '#FF375F'], // tím → hồng
  ['#64D2FF', '#5E5CE6'], // lơ → chàm
  ['#FF453A', '#AC2B24'], // đỏ
];

// Chọn gradient ổn định theo chuỗi (cùng tên luôn cùng màu).
export function gradientFor(key: string): [string, string] {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return GRADIENTS[Math.abs(h) % GRADIENTS.length];
}
