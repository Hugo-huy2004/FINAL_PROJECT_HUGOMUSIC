import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
  Platform,
  View,
} from 'react-native';
import { useAppTheme } from '../../theme/theme';

export interface LiquidGlassButtonProps {
  onPress?: () => void;
  children?: React.ReactNode;
  title?: string;
  variant?: 'primary' | 'glass' | 'pill' | 'circle' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  textStyle?: TextStyle | TextStyle[];
  disabled?: boolean;
  activeOpacity?: number;
  accessibilityLabel?: string;
}

interface SpringVal {
  current: number;
  target: number;
  velocity: number;
}

function createSpring(initial: number): SpringVal {
  return { current: initial, target: initial, velocity: 0 };
}

function updateSpring(s: SpringVal, stiffness: number, damping: number, dt: number): boolean {
  const displacement = s.current - s.target;
  const springForce = -stiffness * displacement;
  const dampingForce = -damping * s.velocity;
  const acceleration = springForce + dampingForce;

  s.velocity += acceleration * dt;
  s.current += s.velocity * dt;

  if (Math.abs(displacement) < 0.002 && Math.abs(s.velocity) < 0.002) {
    s.current = s.target;
    s.velocity = 0;
    return true;
  }
  return false;
}

export default function LiquidGlassButton({
  onPress,
  children,
  title,
  variant = 'primary',
  size = 'md',
  icon,
  style,
  textStyle,
  disabled = false,
  activeOpacity = 0.88,
  accessibilityLabel,
}: LiquidGlassButtonProps) {
  const { colors, isDark } = useAppTheme();
  const btnRef = useRef<any>(null);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);

  // High-precision Hooke's Law spring values
  const springs = useRef({
    scale: createSpring(1),
    squashY: createSpring(1),
    glow: createSpring(0),
  }).current;

  // Droplet click ripples
  const [ripples, setRipples] = useState<
    Array<{ id: number; x: number; y: number; size: number }>
  >([]);

  const applyDOMStyles = useCallback(() => {
    if (Platform.OS !== 'web') return;
    const el = btnRef.current;
    if (!el) return;

    const s = springs.scale.current;
    const sy = springs.squashY.current;
    el.style.transform = `scale(${s}, ${sy * s}) translateZ(0)`;
  }, [springs]);

  const startSpringLoop = useCallback(() => {
    if (Platform.OS !== 'web') return;
    if (rafRef.current !== null) return;
    lastTimeRef.current = null;

    const loop = (timestamp: number) => {
      if (lastTimeRef.current === null) lastTimeRef.current = timestamp;
      const dt = Math.min((timestamp - lastTimeRef.current) / 1000, 0.025);
      lastTimeRef.current = timestamp;

      const sSettled = updateSpring(springs.scale, 280, 19.5, dt);
      const sySettled = updateSpring(springs.squashY, 260, 18.0, dt);
      const gSettled = updateSpring(springs.glow, 240, 20.0, dt);

      applyDOMStyles();

      if (!sSettled || !sySettled || !gSettled) {
        rafRef.current = requestAnimationFrame(loop);
      } else {
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(loop);
  }, [springs, applyDOMStyles]);

  const handlePointerEnter = () => {
    if (disabled || Platform.OS !== 'web') return;
    springs.scale.target = 1.04;
    springs.squashY.target = 1.0;
    springs.glow.target = 1;
    startSpringLoop();
  };

  const handlePointerLeave = () => {
    if (disabled || Platform.OS !== 'web') return;
    springs.scale.target = 1.0;
    springs.squashY.target = 1.0;
    springs.glow.target = 0;
    startSpringLoop();
  };

  const handlePointerDown = (e: any) => {
    if (disabled || Platform.OS !== 'web') return;
    springs.scale.target = 0.94;
    springs.squashY.target = 0.97;
    startSpringLoop();

    // Spawn water droplet ripple
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      const rippleSize = Math.max(rect.width, rect.height) * 2.2;
      const rippleId = Date.now() + Math.random();

      setRipples((prev) => [...prev, { id: rippleId, x: clickX, y: clickY, size: rippleSize }]);
      setTimeout(() => {
        setRipples((prev) => prev.filter((r) => r.id !== rippleId));
      }, 650);
    }
  };

  const handlePointerUp = () => {
    if (disabled || Platform.OS !== 'web') return;
    springs.scale.target = 1.04;
    springs.squashY.target = 1.0;
    startSpringLoop();
  };

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Sizing
  const sizeStyles: Record<
    'sm' | 'md' | 'lg',
    { paddingVertical: number; paddingHorizontal: number; fontSize: number; height?: number }
  > = {
    sm: { paddingVertical: 6, paddingHorizontal: 12, fontSize: 12, height: 32 },
    md: { paddingVertical: 9, paddingHorizontal: 18, fontSize: 13.5, height: 40 },
    lg: { paddingVertical: 12, paddingHorizontal: 24, fontSize: 15, height: 48 },
  };

  const currentSize = sizeStyles[size];

  const getBorderRadius = () => {
    if (variant === 'circle') return 999;
    if (variant === 'pill') return 24;
    return 12;
  };

  const borderRadius = getBorderRadius();

  // Color palettes per variant
  const getVariantStyles = () => {
    if (variant === 'primary') {
      return {
        background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.92) 0%, rgba(5, 150, 105, 0.82) 100%)',
        borderColor: 'rgba(255, 255, 255, 0.45)',
        boxShadow: '0 8px 24px -4px rgba(16, 185, 129, 0.42), inset 0 1.5px 2px rgba(255, 255, 255, 0.65)',
        textColor: '#ffffff',
      };
    }
    if (variant === 'circle') {
      return {
        background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.95) 0%, rgba(4, 120, 87, 0.85) 100%)',
        borderColor: 'rgba(255, 255, 255, 0.55)',
        boxShadow: '0 6px 20px -2px rgba(16, 185, 129, 0.45), inset 0 1.5px 2px rgba(255, 255, 255, 0.7)',
        textColor: '#ffffff',
      };
    }
    if (variant === 'danger') {
      return {
        background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.88) 0%, rgba(185, 28, 28, 0.78) 100%)',
        borderColor: 'rgba(255, 255, 255, 0.4)',
        boxShadow: '0 6px 20px -2px rgba(239, 68, 68, 0.35), inset 0 1.5px 2px rgba(255, 255, 255, 0.55)',
        textColor: '#ffffff',
      };
    }
    // Glass & Pill
    return {
      background: isDark
        ? 'linear-gradient(135deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.04) 100%)'
        : 'linear-gradient(135deg, rgba(255, 255, 255, 0.82) 0%, rgba(255, 255, 255, 0.52) 100%)',
      borderColor: isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(255, 255, 255, 0.6)',
      boxShadow: isDark
        ? '0 4px 14px rgba(0, 0, 0, 0.25), inset 0 1.5px 2px rgba(255, 255, 255, 0.3)'
        : '0 4px 14px rgba(0, 0, 0, 0.06), inset 0 1.5px 2px rgba(255, 255, 255, 0.8)',
      textColor: colors.text,
    };
  };

  const vStyles = getVariantStyles();

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={activeOpacity}
      accessibilityLabel={accessibilityLabel}
      style={[styles.touchable, variant === 'circle' ? styles.circleBase : null, style]}
    >
      <View
        ref={btnRef}
        style={[
          styles.container,
          {
            borderRadius,
            paddingVertical: variant === 'circle' ? 0 : currentSize.paddingVertical,
            paddingHorizontal: variant === 'circle' ? 0 : currentSize.paddingHorizontal,
            borderColor: vStyles.borderColor,
            opacity: disabled ? 0.55 : 1,
          },
          Platform.OS === 'web' &&
            ({
              background: vStyles.background,
              backdropFilter: 'blur(28px) saturate(210%)',
              WebkitBackdropFilter: 'blur(28px) saturate(210%)',
              boxShadow: vStyles.boxShadow,
              cursor: disabled ? 'not-allowed' : 'pointer',
              willChange: 'transform',
            } as any),
        ]}
        // @ts-ignore
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
      >
        {/* Interactive Water Droplet Click Ripples */}
        {Platform.OS === 'web' && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              overflow: 'hidden',
              borderRadius,
              pointerEvents: 'none',
              zIndex: 1,
            }}
          >
            {ripples.map((r) => (
              <span
                key={r.id}
                className="water-droplet-ripple-anim"
                style={{
                  position: 'absolute',
                  left: r.x,
                  top: r.y,
                  width: r.size,
                  height: r.size,
                  borderRadius: '50%',
                  background:
                    'radial-gradient(circle, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.2) 40%, transparent 70%)',
                  border: '1.5px solid rgba(255,255,255,0.75)',
                  pointerEvents: 'none',
                }}
              />
            ))}
          </div>
        )}

        <View style={[styles.contentRow, { zIndex: 2 }]}>
          {icon && <View style={[styles.iconWrapper, !!title && { marginRight: 6 }]}>{icon}</View>}
          {title ? (
            <Text
              style={[
                styles.titleText,
                {
                  fontSize: currentSize.fontSize,
                  color: vStyles.textColor,
                },
                textStyle,
              ]}
            >
              {title}
            </Text>
          ) : (
            children
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  touchable: {
    overflow: 'visible',
  },
  circleBase: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    position: 'relative',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleText: {
    fontWeight: '700',
    letterSpacing: -0.2,
    textAlign: 'center',
  },
});
