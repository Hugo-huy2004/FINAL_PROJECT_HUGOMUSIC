import React, { useEffect, useRef, useState } from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle, Platform, View } from 'react-native';
import { useAppTheme } from '../../theme/theme';

// Nút hành động chính (Đăng nhập, Tiếp tục, Lưu...). iPhone dùng Button SwiftUI (LiquidGlassButton.ios.tsx);
// bản này cho Android + web. Web: kính mờ + lò xo co giãn khi rê/nhấn + gợn nước tại điểm nhấn.
export interface LiquidGlassButtonProps {
  onPress?: () => void;
  title?: string;               // bỏ trống khi đang tải: chỉ hiện `icon` (vòng quay)
  variant?: 'primary' | 'glass';
  size?: 'md' | 'lg';
  icon?: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  disabled?: boolean;
  accessibilityLabel?: string;
  // Chỉ iPhone (LiquidGlassButton.ios.tsx — Button SwiftUI): biểu tượng SF Symbol và màu nền nút.
  systemImage?: string;
  tint?: string;
}

type Spring = { current: number; target: number; velocity: number };
const spring = (v: number): Spring => ({ current: v, target: v, velocity: 0 });
// Lò xo Hooke tắt dần; true khi đã đứng yên.
function step(s: Spring, stiffness: number, damping: number, dt: number) {
  const displacement = s.current - s.target;
  s.velocity += (-stiffness * displacement - damping * s.velocity) * dt;
  s.current += s.velocity * dt;
  if (Math.abs(displacement) < 0.002 && Math.abs(s.velocity) < 0.002) {
    s.current = s.target;
    s.velocity = 0;
    return true;
  }
  return false;
}

const SIZES = {
  md: { paddingVertical: 9, paddingHorizontal: 18, fontSize: 13.5 },
  lg: { paddingVertical: 12, paddingHorizontal: 24, fontSize: 15 },
};
const WEB = Platform.OS === 'web';

export default function LiquidGlassButton({
  onPress, title, variant = 'primary', size = 'md', icon, style, disabled = false, accessibilityLabel,
}: LiquidGlassButtonProps) {
  const { colors, isDark } = useAppTheme();
  const ref = useRef<any>(null);
  const raf = useRef<number | null>(null);
  const springs = useRef({ scale: spring(1), squashY: spring(1) }).current;
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number; size: number }[]>([]);

  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current); }, []);

  // Web: chạy lò xo bằng requestAnimationFrame, ghi thẳng transform vào DOM (không re-render).
  const animate = (scale: number, squashY = 1) => {
    if (!WEB || disabled) return;
    springs.scale.target = scale;
    springs.squashY.target = squashY;
    if (raf.current !== null) return;
    let last: number | null = null;
    const loop = (t: number) => {
      const dt = Math.min((t - (last ?? t)) / 1000, 0.025);
      last = t;
      const scaleDone = step(springs.scale, 280, 19.5, dt);
      const squashDone = step(springs.squashY, 260, 18, dt);
      if (ref.current) ref.current.style.transform = `scale(${springs.scale.current}, ${springs.squashY.current * springs.scale.current}) translateZ(0)`;
      raf.current = scaleDone && squashDone ? null : requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
  };
  const ripple = (e: any) => {
    if (!WEB || disabled || !ref.current) return;
    animate(0.94, 0.97);
    const rect = ref.current.getBoundingClientRect();
    const id = Date.now() + Math.random();
    setRipples((p) => [...p, { id, x: e.clientX - rect.left, y: e.clientY - rect.top, size: Math.max(rect.width, rect.height) * 2.2 }]);
    setTimeout(() => setRipples((p) => p.filter((r) => r.id !== id)), 650);
  };

  const primary = variant === 'primary';
  const sz = SIZES[size];
  const webLook = primary
    ? {
        background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.92) 0%, rgba(5, 150, 105, 0.82) 100%)',
        borderColor: 'rgba(255, 255, 255, 0.45)',
        boxShadow: '0 8px 24px -4px rgba(16, 185, 129, 0.42), inset 0 1.5px 2px rgba(255, 255, 255, 0.65)',
      }
    : {
        background: isDark
          ? 'linear-gradient(135deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.04) 100%)'
          : 'linear-gradient(135deg, rgba(255, 255, 255, 0.82) 0%, rgba(255, 255, 255, 0.52) 100%)',
        borderColor: isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(255, 255, 255, 0.6)',
        boxShadow: isDark
          ? '0 4px 14px rgba(0, 0, 0, 0.25), inset 0 1.5px 2px rgba(255, 255, 255, 0.3)'
          : '0 4px 14px rgba(0, 0, 0, 0.06), inset 0 1.5px 2px rgba(255, 255, 255, 0.8)',
      };

  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.88} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title} style={style}>
      <View
        ref={ref}
        style={[
          styles.container,
          { paddingVertical: sz.paddingVertical, paddingHorizontal: sz.paddingHorizontal, opacity: disabled ? 0.55 : 1 },
          WEB
            ? ({
                ...webLook,
                backdropFilter: 'blur(28px) saturate(210%)',
                WebkitBackdropFilter: 'blur(28px) saturate(210%)',
                cursor: disabled ? 'not-allowed' : 'pointer',
                willChange: 'transform',
              } as object)
            // Android: CSS ở trên không có tác dụng — tô nền thật để chữ luôn đọc được.
            : { backgroundColor: primary ? colors.accent : colors.fill, borderColor: primary ? colors.accent : colors.cardBorder },
        ]}
        // @ts-ignore sự kiện con trỏ chỉ có trên web
        onPointerEnter={() => animate(1.04)}
        onPointerLeave={() => animate(1)}
        onPointerDown={ripple}
        onPointerUp={() => animate(1.04)}
      >
        {WEB && (
          <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: 12, pointerEvents: 'none', zIndex: 1 }}>
            {ripples.map((r) => (
              <span
                key={r.id}
                className="water-droplet-ripple-anim"
                style={{
                  position: 'absolute', left: r.x, top: r.y, width: r.size, height: r.size, borderRadius: '50%',
                  background: 'radial-gradient(circle, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.2) 40%, transparent 70%)',
                  border: '1.5px solid rgba(255,255,255,0.75)', pointerEvents: 'none',
                }}
              />
            ))}
          </div>
        )}
        <View style={styles.row}>
          {icon && <View style={!!title && { marginRight: 6 }}>{icon}</View>}
          {!!title && <Text style={[styles.title, { fontSize: sz.fontSize, color: primary ? '#ffffff' : colors.text }]}>{title}</Text>}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 1, borderRadius: 12 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  title: { fontWeight: '700', letterSpacing: -0.2 },
});
