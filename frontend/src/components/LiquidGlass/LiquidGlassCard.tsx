import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ViewStyle,
  StyleProp,
  Platform,
  TouchableOpacity,
  GestureResponderEvent,
} from 'react-native';
import { useAppTheme } from '../../theme/theme';

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

export interface LiquidGlassCardProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  borderRadius?: number;
  interactive?: boolean;
  activeOpacity?: number;
  specular?: boolean;
  dropletRipple?: boolean;
  glowColor?: string;
  tint?: string;
  className?: string;
  hasBackdropBlur?: boolean;
}

export default function LiquidGlassCard({
  children,
  style,
  onPress,
  borderRadius = 18,
  interactive = true,
  activeOpacity = 0.92,
  specular = true,
  dropletRipple = true,
  glowColor,
  tint,
  hasBackdropBlur = false,
}: LiquidGlassCardProps) {
  const { colors, isDark } = useAppTheme();
  const cardRef = useRef<any>(null);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);

  // Springs for 120fps fluid response
  const springs = useRef({
    scale: createSpring(1),
    tiltX: createSpring(0),
    tiltY: createSpring(0),
    specularX: createSpring(50),
    specularY: createSpring(50),
    specularOpacity: createSpring(0),
  }).current;

  // Ripples list
  const [ripples, setRipples] = useState<
    Array<{ id: number; x: number; y: number; size: number }>
  >([]);

  // Apply DOM styling directly at 120fps with zero React state overhead
  const applyDOMStyles = useCallback(() => {
    if (Platform.OS !== 'web') return;
    const el = cardRef.current;
    if (!el) return;

    const s = springs.scale.current;
    const tx = springs.tiltX.current;
    const ty = springs.tiltY.current;
    const sx = springs.specularX.current;
    const sy = springs.specularY.current;
    const so = springs.specularOpacity.current;

    el.style.transform = `perspective(800px) rotateX(${tx}deg) rotateY(${ty}deg) scale3d(${s}, ${s}, 1)`;

    // Specular shine layer
    const shineEl = el.querySelector('.liquid-specular-shine');
    if (shineEl) {
      shineEl.style.opacity = `${Math.max(0, Math.min(1, so))}`;
      shineEl.style.background = `radial-gradient(circle at ${sx}% ${sy}%, rgba(255, 255, 255, ${
        isDark ? 0.22 : 0.4
      }) 0%, rgba(255, 255, 255, 0.05) 35%, transparent 70%)`;
    }
  }, [springs, isDark]);

  const startSpringLoop = useCallback(() => {
    if (Platform.OS !== 'web') return;
    if (rafRef.current !== null) return;
    lastTimeRef.current = null;

    const loop = (timestamp: number) => {
      if (lastTimeRef.current === null) lastTimeRef.current = timestamp;
      const dt = Math.min((timestamp - lastTimeRef.current) / 1000, 0.025);
      lastTimeRef.current = timestamp;

      // Sub-critically damped Hooke's Law: stiffness 260, damping 19
      const sSettled = updateSpring(springs.scale, 280, 20.0, dt);
      const txSettled = updateSpring(springs.tiltX, 220, 18.0, dt);
      const tySettled = updateSpring(springs.tiltY, 220, 18.0, dt);
      const sxSettled = updateSpring(springs.specularX, 200, 17.0, dt);
      const sySettled = updateSpring(springs.specularY, 200, 17.0, dt);
      const soSettled = updateSpring(springs.specularOpacity, 260, 22.0, dt);

      applyDOMStyles();

      if (!sSettled || !txSettled || !tySettled || !sxSettled || !sySettled || !soSettled) {
        rafRef.current = requestAnimationFrame(loop);
      } else {
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(loop);
  }, [springs, applyDOMStyles]);

  const handlePointerMove = (e: any) => {
    if (!interactive || Platform.OS !== 'web') return;
    const el = cardRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const px = Math.max(0, Math.min(100, (x / rect.width) * 100));
    const py = Math.max(0, Math.min(100, (y / rect.height) * 100));

    // Subtle 3D tilt
    const maxTilt = 4.5;
    const tiltX = -((py - 50) / 50) * maxTilt;
    const tiltY = ((px - 50) / 50) * maxTilt;

    springs.specularX.target = px;
    springs.specularY.target = py;
    springs.specularOpacity.target = 1;
    springs.tiltX.target = tiltX;
    springs.tiltY.target = tiltY;

    startSpringLoop();
  };

  const handlePointerEnter = () => {
    if (!interactive || Platform.OS !== 'web') return;
    springs.scale.target = 1.022;
    springs.specularOpacity.target = 1;
    startSpringLoop();
  };

  const handlePointerLeave = () => {
    if (!interactive || Platform.OS !== 'web') return;
    springs.scale.target = 1.0;
    springs.tiltX.target = 0;
    springs.tiltY.target = 0;
    springs.specularOpacity.target = 0;
    startSpringLoop();
  };

  const handlePointerDown = (e: any) => {
    if (!interactive || Platform.OS !== 'web') return;
    springs.scale.target = 0.965;
    startSpringLoop();

    if (dropletRipple && cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      const rippleSize = Math.max(rect.width, rect.height) * 2;

      const rippleId = Date.now() + Math.random();
      setRipples((prev) => [...prev, { id: rippleId, x: clickX, y: clickY, size: rippleSize }]);

      setTimeout(() => {
        setRipples((prev) => prev.filter((r) => r.id !== rippleId));
      }, 700);
    }
  };

  const handlePointerUp = () => {
    if (!interactive || Platform.OS !== 'web') return;
    springs.scale.target = 1.022;
    startSpringLoop();
  };

  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  const defaultGlow = glowColor || (isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.1)');
  const baseBg = tint || (isDark ? 'rgba(28, 28, 32, 0.72)' : 'rgba(255, 255, 255, 0.78)');
  const borderColor = isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(255, 255, 255, 0.55)';

  const cardContent = (
    <View
      ref={cardRef}
      style={[
        styles.cardContainer,
        {
          borderRadius,
          backgroundColor: baseBg,
          borderColor,
        },
        Platform.OS === 'web' &&
          ({
            ...(hasBackdropBlur
              ? {
                  backdropFilter: 'blur(24px) saturate(200%)',
                  WebkitBackdropFilter: 'blur(24px) saturate(200%)',
                }
              : {}),
            boxShadow: `0 8px 24px -6px ${defaultGlow}, inset 0 1.5px 2px 0 rgba(255, 255, 255, ${
              isDark ? 0.32 : 0.75
            }), inset 0 -1.5px 2px 0 rgba(0, 0, 0, ${isDark ? 0.35 : 0.1})`,
            willChange: 'transform',
            cursor: onPress ? 'pointer' : 'default',
          } as any),
        style,
      ]}
      // @ts-ignore Web pointer events
      onPointerMove={handlePointerMove}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    >
      {/* 1. Specular Light Shimmer Overlay */}
      {specular && Platform.OS === 'web' && (
        <div
          className="liquid-specular-shine"
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius,
            pointerEvents: 'none',
            zIndex: 1,
            opacity: 0,
            transition: 'opacity 0.15s ease',
          }}
        />
      )}

      {/* 2. Water Droplet Ripples */}
      {dropletRipple && Platform.OS === 'web' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            overflow: 'hidden',
            borderRadius,
            pointerEvents: 'none',
            zIndex: 2,
          }}
        >
          {ripples.map((rip) => (
            <span
              key={rip.id}
              className="water-droplet-ripple-anim"
              style={{
                position: 'absolute',
                left: rip.x,
                top: rip.y,
                width: rip.size,
                height: rip.size,
                borderRadius: '50%',
                background:
                  'radial-gradient(circle, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.18) 35%, transparent 70%)',
                boxShadow: '0 0 20px rgba(255,255,255,0.5)',
                border: '1.5px solid rgba(255,255,255,0.65)',
                pointerEvents: 'none',
              }}
            />
          ))}
        </div>
      )}

      {/* 3. Main Child Content */}
      <View style={[styles.innerContent, { borderRadius, zIndex: 3 }]}>{children}</View>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={activeOpacity}
        style={[styles.touchableWrapper, { borderRadius }]}
      >
        {cardContent}
      </TouchableOpacity>
    );
  }

  return cardContent;
}

const styles = StyleSheet.create({
  touchableWrapper: {
    overflow: 'visible',
  },
  cardContainer: {
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1,
  },
  innerContent: {
    width: '100%',
    height: '100%',
  },
});
