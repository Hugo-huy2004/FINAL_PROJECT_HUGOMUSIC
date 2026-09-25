import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ScrollView,
  Image,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import { useStore } from '../../store/useStore';
import {
  useAppTheme,
  BRAND_GRADIENT_LIGHT,
  BRAND_GRADIENT_LIGHT_LOCATIONS,
  BRAND_GRADIENT_DARK,
  BRAND_GRADIENT_DARK_LOCATIONS,
} from '../../theme/theme';
import { useTranslation } from '../../i18n/i18n';
import { UserAvatar } from '../UserAvatar';

export type SidebarMode = 'bubble' | 'rail' | 'full';

export interface SidebarProps {
  onLoginPress: () => void;
  onProfilePress: () => void;
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

// -----------------------------------------------------------------------------
// High-Precision Spring Physics Helper (Symplectic Euler Integration)
// -----------------------------------------------------------------------------
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
  const acceleration = springForce + dampingForce; // mass = 1

  s.velocity += acceleration * dt;
  s.current += s.velocity * dt;

  // Snap to target when settled to stop continuous RAF
  if (Math.abs(displacement) < 0.04 && Math.abs(s.velocity) < 0.04) {
    s.current = s.target;
    s.velocity = 0;
    return true; // settled
  }
  return false;
}

export default function Sidebar({
  onLoginPress,
  onProfilePress,
  activeTab,
  onTabChange,
}: SidebarProps) {
  const user = useStore((state) => state.user);
  const logout = useStore((state) => state.logout);
  const partyRoomId = useStore((state) => state.partyRoomId);
  const { colors, isDark } = useAppTheme();
  const { t } = useTranslation();
  const { height: windowHeight } = useWindowDimensions();

  // 3-state mode: 'bubble' (54px) <-> 'rail' (68px) <-> 'full' (262px)
  const [mode, setMode] = useState<SidebarMode>('rail');
  const [isPinned, setIsPinned] = useState(false);

  // DOM Refs for direct 120fps hardware-accelerated RAF animation
  const containerRef = useRef<any>(null);
  const bodyRef = useRef<any>(null);
  const wordmarkRef = useRef<any>(null);
  const actionsRef = useRef<any>(null);
  const labelsContainerRef = useRef<any[]>([]);

  // Spring state values
  const maxHeight = Platform.OS === 'web' ? window.innerHeight - 36 : windowHeight - 36;
  const springs = useRef({
    width: createSpring(68),
    height: createSpring(maxHeight),
    radius: createSpring(28),
    scaleX: createSpring(1),
    scaleY: createSpring(1),
    contentOpacity: createSpring(1),
    wordmarkWidth: createSpring(0),
    wordmarkOpacity: createSpring(0),
    labelsWidth: createSpring(0),
    labelsOpacity: createSpring(0),
  }).current;

  const rafIdRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const prevModeRef = useRef<SidebarMode>('rail');

  // Interactive Live Gesture Drag State
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{
    clientX: number;
    clientY: number;
    initialWidth: number;
    initialHeight: number;
    time: number;
    lastClientX: number;
    lastClientY: number;
    lastTime: number;
    hasMoved: boolean;
  }>({
    clientX: 0,
    clientY: 0,
    initialWidth: 68,
    initialHeight: maxHeight,
    time: 0,
    lastClientX: 0,
    lastClientY: 0,
    lastTime: 0,
    hasMoved: false,
  });

  const brandColors = isDark ? BRAND_GRADIENT_DARK : BRAND_GRADIENT_LIGHT;
  const brandLocations = isDark ? BRAND_GRADIENT_DARK_LOCATIONS : BRAND_GRADIENT_LIGHT_LOCATIONS;

  // ---------------------------------------------------------------------------
  // Master DOM Styles Renderer (120fps direct mutation, zero React re-render lag)
  // ---------------------------------------------------------------------------
  const applyDOMStyles = useCallback(() => {
    if (Platform.OS !== 'web') return;
    const el = containerRef.current;
    if (!el) return;

    const w = springs.width.current;
    const h = springs.height.current;
    const r = springs.radius.current;
    const sx = springs.scaleX.current;
    const sy = springs.scaleY.current;

    // Apply main morphing container dimensions with liquid scale and hardware acceleration
    el.style.width = `${Math.max(48, w)}px`;
    el.style.height = `${Math.max(48, h)}px`;
    el.style.borderRadius = `${Math.max(20, r)}px`;
    el.style.transform = `scale(${sx}, ${sy}) translate3d(0, 0, 0)`;

    // Body content fade
    if (bodyRef.current) {
      bodyRef.current.style.opacity = `${Math.max(0, Math.min(1, springs.contentOpacity.current))}`;
    }

    // Wordmark text reveal with subtle slide
    if (wordmarkRef.current) {
      const wOpacity = Math.max(0, Math.min(1, springs.wordmarkOpacity.current));
      wordmarkRef.current.style.maxWidth = `${Math.max(0, springs.wordmarkWidth.current)}px`;
      wordmarkRef.current.style.opacity = `${wOpacity}`;
      const slideX = (1 - wOpacity) * -10;
      wordmarkRef.current.style.transform = `translateX(${slideX}px)`;
    }

    // Header actions
    if (actionsRef.current) {
      const aOpacity = Math.max(0, Math.min(1, springs.wordmarkOpacity.current));
      actionsRef.current.style.opacity = `${aOpacity}`;
      actionsRef.current.style.maxWidth = `${Math.max(0, springs.wordmarkWidth.current > 30 ? 90 : 0)}px`;
      actionsRef.current.style.pointerEvents = springs.wordmarkWidth.current > 70 ? 'auto' : 'none';
    }

    // Menu text labels reveal with micro-staggered fluid cascade
    const labelW = springs.labelsWidth.current;
    const labelOp = Math.max(0, Math.min(1, springs.labelsOpacity.current));
    labelsContainerRef.current.forEach((node, idx) => {
      if (node) {
        const staggerW = Math.max(0, labelW - idx * 2.2);
        const staggerOp = Math.max(0, Math.min(1, (labelOp - idx * 0.015) / 0.85));
        node.style.maxWidth = `${staggerW}px`;
        node.style.opacity = `${staggerOp}`;
        const slideX = (1 - staggerOp) * -8;
        node.style.transform = `translateX(${slideX}px)`;
      }
    });
  }, [springs]);

  // ---------------------------------------------------------------------------
  // Master requestAnimationFrame Spring Loop
  // ---------------------------------------------------------------------------
  const startSpringLoop = useCallback(() => {
    if (rafIdRef.current !== null) return;
    lastTimeRef.current = null;

    const loop = (timestamp: number) => {
      if (lastTimeRef.current === null) {
        lastTimeRef.current = timestamp;
      }
      const dt = Math.min((timestamp - lastTimeRef.current) / 1000, 0.025);
      lastTimeRef.current = timestamp;

      // Spring Physics Parameters (Tuned for Apple Fluid Elastic Response):
      // Stiffness 240, damping 18.5 -> damping ratio ~0.597 produces a silky 5% bounce!
      const wSettled = updateSpring(springs.width, 240, 18.5, dt);
      const hSettled = updateSpring(springs.height, 220, 18.0, dt);
      const rSettled = updateSpring(springs.radius, 260, 22.0, dt);
      const sxSettled = updateSpring(springs.scaleX, 210, 16.0, dt);
      const sySettled = updateSpring(springs.scaleY, 210, 16.0, dt);
      const cSettled = updateSpring(springs.contentOpacity, 260, 22.0, dt);
      const wwSettled = updateSpring(springs.wordmarkWidth, 240, 19.0, dt);
      const woSettled = updateSpring(springs.wordmarkOpacity, 260, 22.0, dt);
      const lwSettled = updateSpring(springs.labelsWidth, 240, 19.0, dt);
      const loSettled = updateSpring(springs.labelsOpacity, 260, 22.0, dt);

      applyDOMStyles();

      const allSettled =
        wSettled &&
        hSettled &&
        rSettled &&
        sxSettled &&
        sySettled &&
        cSettled &&
        wwSettled &&
        woSettled &&
        lwSettled &&
        loSettled;

      if (!allSettled) {
        rafIdRef.current = requestAnimationFrame(loop);
      } else {
        rafIdRef.current = null;
      }
    };

    rafIdRef.current = requestAnimationFrame(loop);
  }, [springs, applyDOMStyles]);

  // Initial layout application on mount
  useEffect(() => {
    applyDOMStyles();
  }, [applyDOMStyles]);

  // When `mode` changes, set target spring values and apply liquid impulse
  useEffect(() => {
    const curH = Platform.OS === 'web' ? window.innerHeight - 36 : windowHeight - 36;
    const prev = prevModeRef.current;
    prevModeRef.current = mode;

    if (mode === 'bubble') {
      springs.width.target = 54;
      springs.height.target = 54;
      springs.radius.target = 27;
      springs.contentOpacity.target = 0;
      springs.wordmarkWidth.target = 0;
      springs.wordmarkOpacity.target = 0;
      springs.labelsWidth.target = 0;
      springs.labelsOpacity.target = 0;

      // Elastic snap-back impulse
      if (prev === 'rail' || prev === 'full') {
        springs.scaleY.velocity = -1.8;
        springs.scaleX.velocity = 0.9;
      }
    } else if (mode === 'rail') {
      springs.width.target = 68;
      springs.height.target = curH;
      springs.radius.target = 28;
      springs.contentOpacity.target = 1;
      springs.wordmarkWidth.target = 0;
      springs.wordmarkOpacity.target = 0;
      springs.labelsWidth.target = 0;
      springs.labelsOpacity.target = 0;

      if (prev === 'bubble') {
        // Vertical droplet drop stretch
        springs.scaleY.velocity = 2.0;
        springs.scaleX.velocity = -0.9;
      } else if (prev === 'full') {
        // Horizontal retraction bounce
        springs.scaleX.velocity = -1.6;
        springs.scaleY.velocity = 0.7;
      }
    } else if (mode === 'full') {
      springs.width.target = 262;
      springs.height.target = curH;
      springs.radius.target = 28;
      springs.contentOpacity.target = 1;
      springs.wordmarkWidth.target = 140;
      springs.wordmarkOpacity.target = 1;
      springs.labelsWidth.target = 160;
      springs.labelsOpacity.target = 1;

      // Horizontal liquid surge impulse
      springs.scaleX.velocity = 1.7;
      springs.scaleY.velocity = -0.6;
    }

    startSpringLoop();

    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [mode, windowHeight, springs, startSpringLoop]);

  // Handle window resize dynamically
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onResize = () => {
      if (mode !== 'bubble') {
        springs.height.target = window.innerHeight - 36;
        startSpringLoop();
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [mode, springs, startSpringLoop]);

  // ---------------------------------------------------------------------------
  // Real-Time Gesture Drag & Swipe Controller ("vuốt ra, thu vào mượt mà")
  // ---------------------------------------------------------------------------
  const onWindowPointerMove = useCallback((e: PointerEvent) => {
    if (!isDraggingRef.current) return;

    const dx = e.clientX - dragStartRef.current.clientX;
    const dy = e.clientY - dragStartRef.current.clientY;

    if (!dragStartRef.current.hasMoved) {
      if (Math.hypot(dx, dy) > 5) {
        dragStartRef.current.hasMoved = true;
        if (containerRef.current) {
          containerRef.current.classList.add('is-dragging');
        }
      } else {
        return;
      }
    }

    e.preventDefault();

    const now = performance.now();
    dragStartRef.current.lastClientX = e.clientX;
    dragStartRef.current.lastClientY = e.clientY;
    dragStartRef.current.lastTime = now;

    // Interactive tracking depending on active mode:
    if (mode === 'rail') {
      if (dx > 0) {
        // Vuốt ra: stretching outward towards Full (68 -> 262)
        let w = 68 + dx;
        if (w > 262) {
          // Rubber band resistance past 262
          w = 262 + (w - 262) * 0.22;
        }
        springs.width.current = w;
        springs.width.target = w;

        // Progress 0..1
        const progress = Math.min(1, Math.max(0, (w - 68) / (262 - 68)));
        springs.wordmarkWidth.current = progress * 140;
        springs.wordmarkOpacity.current = progress;
        springs.labelsWidth.current = progress * 160;
        springs.labelsOpacity.current = progress;
        springs.contentOpacity.current = 1;

        // Subtle fluid squash & stretch
        springs.scaleX.current = 1 + progress * 0.025;
        springs.scaleY.current = 1 - progress * 0.012;
      } else {
        // Thu vào: pulling inward towards bubble
        const w = Math.max(50, 68 + dx * 0.6);
        springs.width.current = w;
        springs.width.target = w;
        springs.radius.current = 28 - (68 - w) * 0.1;
      }
    } else if (mode === 'full') {
      if (dx < 0) {
        // Thu vào: collapsing inward towards rail (262 -> 68)
        let w = 262 + dx;
        if (w < 68) {
          // Rubber band resistance past 68
          w = 68 + (w - 68) * 0.22;
        }
        springs.width.current = w;
        springs.width.target = w;

        const progress = Math.min(1, Math.max(0, (w - 68) / (262 - 68)));
        springs.wordmarkWidth.current = progress * 140;
        springs.wordmarkOpacity.current = progress;
        springs.labelsWidth.current = progress * 160;
        springs.labelsOpacity.current = progress;

        springs.scaleX.current = 1 - (1 - progress) * 0.025;
        springs.scaleY.current = 1 + (1 - progress) * 0.012;
      }
    } else if (mode === 'bubble') {
      if (dy > 0) {
        // Vuốt xuống: dropping downward towards rail (54 -> maxHeight)
        const curH = window.innerHeight - 36;
        let h = 54 + dy;
        if (h > curH) h = curH + (h - curH) * 0.2;
        springs.height.current = h;
        springs.height.target = h;

        const progress = Math.min(1, Math.max(0, (h - 54) / (curH - 54)));
        springs.width.current = 54 + progress * 14;
        springs.width.target = springs.width.current;
        springs.radius.current = 27 + progress * 1;
        springs.contentOpacity.current = progress;

        // Droplet stretch
        springs.scaleY.current = 1 + Math.min(0.08, progress * 0.14);
        springs.scaleX.current = 1 - Math.min(0.04, progress * 0.07);
      }
    }

    applyDOMStyles();
  }, [mode, springs, applyDOMStyles]);

  const onWindowPointerUp = useCallback((e: PointerEvent) => {
    window.removeEventListener('pointermove', onWindowPointerMove);
    window.removeEventListener('pointerup', onWindowPointerUp);
    window.removeEventListener('pointercancel', onWindowPointerUp);

    if (containerRef.current) {
      containerRef.current.classList.remove('is-dragging');
    }

    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;

    const dx = e.clientX - dragStartRef.current.clientX;
    const dy = e.clientY - dragStartRef.current.clientY;
    const dt = Math.max(1, performance.now() - dragStartRef.current.time);
    const vx = dx / dt; // px/ms
    const vy = dy / dt; // px/ms

    if (!dragStartRef.current.hasMoved) {
      // Clean tap, do not intercept
      return;
    }

    // Cancel synthetic click underneath to protect buttons from firing on swipe
    const preventClick = (ev: MouseEvent) => {
      ev.stopPropagation();
      ev.preventDefault();
      window.removeEventListener('click', preventClick, true);
    };
    window.addEventListener('click', preventClick, true);

    // Gesture decision and dynamic momentum velocity injection:
    if (mode === 'rail') {
      if (dx > 45 || vx > 0.3) {
        // Vuốt bung ra Full!
        springs.width.velocity = Math.max(300, vx * 1000);
        springs.scaleX.velocity = 0.85;
        springs.scaleY.velocity = -0.4;
        setMode('full');
      } else if (dx < -30 || vx < -0.3 || dy < -45 || vy < -0.3) {
        // Vuốt thu vào Bubble!
        setMode('bubble');
      } else {
        // Snap back to rail
        springs.width.target = 68;
        springs.scaleX.velocity = -0.3;
        startSpringLoop();
      }
    } else if (mode === 'full') {
      if (dx < -45 || vx < -0.3) {
        // Vuốt thu vào Rail!
        springs.width.velocity = Math.min(-300, vx * 1000);
        springs.scaleX.velocity = -0.85;
        springs.scaleY.velocity = 0.4;
        setMode('rail');
      } else {
        // Snap back to full
        springs.width.target = 262;
        springs.labelsWidth.target = 160;
        springs.labelsOpacity.target = 1;
        springs.wordmarkWidth.target = 140;
        springs.wordmarkOpacity.target = 1;
        startSpringLoop();
      }
    } else if (mode === 'bubble') {
      if (dy > 45 || vy > 0.3 || dx > 35 || vx > 0.3) {
        // Vuốt bung xuống Rail!
        springs.height.velocity = Math.max(350, vy * 1000);
        setMode('rail');
      } else {
        // Snap back to bubble
        springs.width.target = 54;
        springs.height.target = 54;
        startSpringLoop();
      }
    }
  }, [mode, onWindowPointerMove, springs, startSpringLoop]);

  const handlePointerDown = (e: any) => {
    if (Platform.OS !== 'web') return;
    if (e.button !== undefined && e.button !== 0) return;

    const now = performance.now();
    isDraggingRef.current = true;
    dragStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      initialWidth: springs.width.current,
      initialHeight: springs.height.current,
      time: now,
      lastClientX: e.clientX,
      lastClientY: e.clientY,
      lastTime: now,
      hasMoved: false,
    };

    // Stop currently running RAF loop so user has 1:1 direct control
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    window.addEventListener('pointermove', onWindowPointerMove, { passive: false });
    window.addEventListener('pointerup', onWindowPointerUp, { passive: false });
    window.addEventListener('pointercancel', onWindowPointerUp, { passive: false });
  };

  const handleLogoPress = () => {
    if (mode === 'bubble') setMode('rail');
    else if (mode === 'rail') setMode('full');
    else if (mode === 'full') setMode('rail');
  };

  const handleItemClick = (tabId: string) => {
    if (dragStartRef.current.hasMoved) return;
    onTabChange(tabId);
  };

  const isBubble = mode === 'bubble';
  const isRail = mode === 'rail';
  const isFull = mode === 'full';

  return (
    <View
      ref={containerRef}
      style={[
        styles.polymorphicContainer,
        { backgroundColor: Platform.OS === 'web' ? colors.glass : colors.glassSolid },
        Platform.OS === 'web' &&
          ({
            position: 'fixed',
            top: 18,
            left: 18,
            zIndex: 1000,
            cursor: isBubble ? 'pointer' : 'default',
            transformOrigin: 'top left',
          } as any),
      ]}
      // @ts-ignore dataSet is react-native-web only
      dataSet={{ glass: isDark ? 'dark' : 'light' }}
      // @ts-ignore
      onPointerDown={handlePointerDown}
    >

      {/* Interactive Edge Swipe Grabber Handle ("Vuốt ra / Thu vào") */}
      {!isBubble && (
        <TouchableOpacity
          style={[
            styles.edgeGrabberZone,
            { cursor: isFull ? 'w-resize' : 'e-resize' } as any,
          ]}
          onPress={() => {
            if (isFull) setMode('rail');
            else if (isRail) setMode('full');
          }}
          activeOpacity={0.8}
          // @ts-ignore
          title={isFull ? 'Kéo hoặc nhấp để thu vào (Rail)' : 'Vuốt hoặc nhấp để mở rộng (Full)'}
        >
          <View
            style={[
              styles.edgeGrabberPill,
              {
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.32)' : 'rgba(0, 0, 0, 0.25)',
              },
            ]}
            // @ts-ignore
            className="liquid-grabber-pill"
          />
        </TouchableOpacity>
      )}

      {/* ================================================================= */}
      {/* 1. PERSISTENT TOP HEADER / LOGO BAR                                */}
      {/* ================================================================= */}
      <View
        style={[
          styles.headerBar,
          {
            paddingHorizontal: isFull ? 12 : 0,
            justifyContent: isFull ? 'space-between' : 'center',
            height: isBubble ? 54 : 52,
          },
        ]}
      >
        {/* Brand Group (Logo + Wordmark) */}
        <TouchableOpacity
          style={[
            styles.brandGroupTouch,
            { width: isFull ? 'auto' : '100%', justifyContent: isFull ? 'flex-start' : 'center', alignItems: 'center' },
          ]}
          onPress={handleLogoPress}
          activeOpacity={0.8}
          accessibilityLabel="Hugo Music"
        >
          {/* Official High-Res Hugo Music Logo (frontend/assets/logo.png) */}
          <View
            style={[
              styles.logoWrapper,
              {
                width: isBubble ? 42 : isRail ? 38 : 32,
                height: isBubble ? 42 : isRail ? 38 : 32,
                borderRadius: (isBubble ? 42 : isRail ? 38 : 32) / 2,
              },
            ]}
          >
            <Image
              source={require('../../../assets/logo.png')}
              style={{
                width: isBubble ? 42 : isRail ? 38 : 32,
                height: isBubble ? 42 : isRail ? 38 : 32,
              }}
              resizeMode="contain"
            />
          </View>

          {/* Hugo Music Wordmark - smoothly animated via RAF */}
          <View
            ref={wordmarkRef}
            style={[
              styles.wordmarkContainer,
              {
                marginLeft: isFull ? 8 : 0,
              },
            ]}
          >
            {Platform.OS === 'web' ? (
              <Text
                style={[
                  styles.logoHugo,
                  {
                    backgroundImage: `linear-gradient(90deg, ${brandColors.map((c, i) => `${c} ${brandLocations[i] * 100}%`).join(', ')})`,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    color: 'transparent',
                    display: 'inline-block',
                  } as any,
                ]}
              >
                Hugo
              </Text>
            ) : (
              <MaskedView
                style={{ flexDirection: 'row', height: 24 }}
                maskElement={<Text style={styles.logoHugo}>Hugo</Text>}
              >
                <LinearGradient
                  colors={brandColors}
                  locations={brandLocations}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{ flex: 1 }}
                >
                  <Text style={[styles.logoHugo, { opacity: 0 }]}>Hugo</Text>
                </LinearGradient>
              </MaskedView>
            )}
            <Text style={[styles.logoMusic, { color: colors.text }]}>Music</Text>
          </View>
        </TouchableOpacity>

        {/* Header Action Tools in Full Mode: Pin, Collapse to Rail, Minimize */}
        <View ref={actionsRef} style={styles.headerActions}>
          {/* Pin Button */}
          <TouchableOpacity
            style={[
              styles.headerToolBtn,
              isPinned && { backgroundColor: 'rgba(16, 185, 129, 0.22)' },
            ]}
            onPress={() => setIsPinned(!isPinned)}
            activeOpacity={0.7}
            accessibilityLabel={isPinned ? 'Unpin Sidebar' : 'Pin Sidebar'}
          >
            <Ionicons
              name={isPinned ? 'pin' : 'pin-outline'}
              size={15}
              color={isPinned ? '#10B981' : colors.textSecondary}
            />
          </TouchableOpacity>

          {/* Quick Collapse to Rail */}
          <TouchableOpacity
            style={styles.headerToolBtn}
            onPress={() => setMode('rail')}
            activeOpacity={0.7}
            accessibilityLabel="Thu gọn dạng cột icon"
          >
            <Ionicons name="chevron-back" size={16} color={colors.textSecondary} />
          </TouchableOpacity>

          {/* Minimize to Bubble */}
          <TouchableOpacity
            style={styles.headerToolBtn}
            onPress={() => setMode('bubble')}
            activeOpacity={0.7}
            accessibilityLabel="Thu nhỏ thành logo tròn"
          >
            <Ionicons name="remove" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Bubble Mode Live Party Dot */}
        {isBubble && partyRoomId && <View style={styles.bubblePartyDot} />}
      </View>

      {/* ================================================================= */}
      {/* 2. REVEALABLE BODY (Rail Icons & Full Menu Items)                  */}
      {/* ================================================================= */}
      <View
        ref={bodyRef}
        style={[
          styles.morphBody,
          {
            pointerEvents: isBubble ? 'none' : 'auto',
          },
        ]}
      >
        <View style={styles.glassDivider} />

        {/* User Profile Card / Avatar */}
        <TouchableOpacity
          style={[
            styles.profileRowTouch,
            isFull && {
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.06)',
            },
          ]}
          onPress={user ? onProfilePress : onLoginPress}
          activeOpacity={0.8}
        >
          {user ? (
            <UserAvatar
              avatarUrl={user.avatarUrl}
              username={user.username}
              nickname={user.nickname}
              size={isFull ? 34 : 32}
            />
          ) : (
            <Image
              source={require('../../../assets/logo.png')}
              style={{ width: 32, height: 32, borderRadius: 16 }}
              resizeMode="contain"
            />
          )}

          {/* Profile Details (reveals smoothly in Full mode) */}
          <View
            ref={(el) => {
              if (el) labelsContainerRef.current[0] = el;
            }}
            style={styles.profileDetails}
          >
            <Text style={[styles.profileNickname, { color: colors.text }]} numberOfLines={1}>
              {user ? user.nickname || user.username || 'Hugo Member' : 'Hugo Wishpax Le'}
            </Text>
            <Text style={[styles.profileRole, { color: colors.textSecondary }]} numberOfLines={1}>
              {user ? t('account') : t('login')}
            </Text>
          </View>

          {isFull && <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} />}
        </TouchableOpacity>

        <View style={styles.glassDivider} />

        {/* Scrollable Navigation Menu */}
        <ScrollView
          style={[
            styles.navScrollView,
            Platform.OS === 'web' && ({
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              overflowY: isRail ? 'hidden' : 'auto',
            } as any),
          ]}
          contentContainerStyle={{
            paddingBottom: 16,
            alignItems: 'center',
          }}
          showsVerticalScrollIndicator={false}
          // @ts-ignore dataSet is react-native-web only
          dataSet={{ scrollbar: 'none' }}
        >
          {/* Section: MENU */}
          <View style={styles.sectionContainer}>
            {isFull && (
              <Text style={[styles.sectionHeading, { color: isDark ? '#8E8E93' : '#6E6E73' }]}>
                MENU
              </Text>
            )}

            {[
              { id: 'search', icon: 'search-outline', label: t('search') },
              { id: 'home', icon: 'home-outline', label: t('home') },
              { id: 'new', icon: 'compass-outline', label: t('browse') },
              { id: 'radio', icon: 'radio-outline', label: t('radio') },
              {
                id: 'party',
                icon: 'people-outline',
                label: partyRoomId ? `Party (#${partyRoomId})` : t('partySync') || 'Sync Party',
                isParty: true,
              },
            ].map((item, idx) => {
              const isActive = activeTab === item.id;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.navItemRow,
                    isRail && styles.navItemRowRail,
                    isActive && {
                      backgroundColor: colors.fill,
                      borderColor: 'transparent',
                    },
                    Platform.OS === 'web' && ({
                      touchAction: 'manipulation',
                      WebkitTapHighlightColor: 'transparent',
                      cursor: 'pointer',
                    } as any),
                  ]}
                  onPress={() => handleItemClick(item.id)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  accessibilityLabel={item.label}
                >
                  <Ionicons
                    name={item.icon as any}
                    size={20}
                    color={
                      isActive
                        ? colors.accent
                        : isDark
                        ? 'rgba(255, 255, 255, 0.82)'
                        : colors.text
                    }
                    style={isRail ? styles.navItemIconRail : styles.navItemIcon}
                  />

                  {/* Label - driven smoothly by requestAnimationFrame */}
                  <View
                    ref={(el) => {
                      if (el) labelsContainerRef.current[idx + 1] = el;
                    }}
                    style={styles.labelWrapper}
                  >
                    <Text
                      style={[
                        styles.navItemText,
                        { color: colors.text },
                        isActive && styles.navItemTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      {item.label}
                    </Text>
                  </View>

                  {item.isParty && partyRoomId && (
                    <View style={[styles.partyBadgeDot, isRail && styles.partyBadgeDotRail]} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Section: THƯ VIỆN */}
          <View style={styles.sectionContainer}>
            {isFull && (
              <Text style={[styles.sectionHeading, { color: isDark ? '#8E8E93' : '#6E6E73' }]}>
                {t('librarySection')}
              </Text>
            )}

            {/* Chỉ những gì THUỘC VỀ NGƯỜI DÙNG. Trước đây mục này gộp lẫn đồ
                cá nhân với các trục duyệt kho (thể loại, quốc gia, album, nghệ
                sĩ) thành 6 dòng — hai nhóm khác hẳn nhau về mục đích. */}
            {[
              { id: 'songs', icon: 'musical-note-outline', label: t('songs') },
              { id: 'playlists', icon: 'list-outline', label: t('allPlaylists') },
              { id: 'recently-added', icon: 'time-outline', label: t('recentlyAdded') },
            ].map((item, idx) => {
              const isActive = activeTab === item.id;
              const refIndex = idx + 6;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.navItemRow,
                    isRail && styles.navItemRowRail,
                    isActive && {
                      backgroundColor: colors.fill,
                      borderColor: 'transparent',
                    },
                    Platform.OS === 'web' && ({
                      touchAction: 'manipulation',
                      WebkitTapHighlightColor: 'transparent',
                      cursor: 'pointer',
                    } as any),
                  ]}
                  onPress={() => handleItemClick(item.id)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  accessibilityLabel={item.label}
                >
                  <Ionicons
                    name={item.icon as any}
                    size={20}
                    color={
                      isActive
                        ? colors.accent
                        : isDark
                        ? 'rgba(255, 255, 255, 0.82)'
                        : colors.text
                    }
                    style={isRail ? styles.navItemIconRail : styles.navItemIcon}
                  />

                  <View
                    ref={(el) => {
                      if (el) labelsContainerRef.current[refIndex] = el;
                    }}
                    style={styles.labelWrapper}
                  >
                    <Text
                      style={[
                        styles.navItemText,
                        { color: colors.text },
                        isActive && styles.navItemTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      {item.label}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Section: DUYỆT THEO — các trục khám phá kho nhạc.
              Xếp thể loại/quốc gia trước vì 452/516 bài có thể loại, trong khi
              chỉ 2/255 nghệ sĩ có ảnh thật: duyệt theo nghệ sĩ gần như vô dụng
              với kho này. */}
          <View style={styles.sectionContainer}>
            {isFull && (
              <Text style={[styles.sectionHeading, { color: isDark ? '#8E8E93' : '#6E6E73' }]}>
                DUYỆT THEO
              </Text>
            )}

            {[
              { id: 'genres', icon: 'grid-outline', label: 'Thể loại' },
              { id: 'countries', icon: 'globe-outline', label: 'Quốc gia' },
              { id: 'albums', icon: 'albums-outline', label: t('albums') },
              { id: 'artists', icon: 'mic-outline', label: t('artists') },
            ].map((item, idx) => {
              const isActive = activeTab === item.id;
              const refIndex = idx + 10;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.navItemRow,
                    isActive && {
                      backgroundColor: colors.fill,
                      borderColor: 'transparent',
                    },
                  ]}
                  onPress={() => handleItemClick(item.id)}
                  activeOpacity={0.7}
                  accessibilityLabel={item.label}
                >
                  <Ionicons
                    name={item.icon as any}
                    size={20}
                    color={
                      isActive
                        ? colors.accent
                        : isDark
                        ? 'rgba(255, 255, 255, 0.82)'
                        : colors.text
                    }
                    style={styles.navItemIcon}
                  />

                  <View
                    ref={(el) => {
                      if (el) labelsContainerRef.current[refIndex] = el;
                    }}
                    style={styles.labelWrapper}
                  >
                    <Text
                      style={[
                        styles.navItemText,
                        { color: colors.text },
                        isActive && styles.navItemTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      {item.label}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        {/* Rail Mode Bottom Controls: Quick expand [>] or minimize [—] */}
        {isRail && (
          <View style={styles.railBottomDock}>
            <TouchableOpacity
              style={styles.railBottomBtn}
              onPress={() => setMode('full')}
              activeOpacity={0.7}
              accessibilityLabel="Mở rộng đầy đủ"
            >
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.railBottomBtn}
              onPress={() => setMode('bubble')}
              activeOpacity={0.7}
              accessibilityLabel="Thu nhỏ thành logo tròn"
            >
              <Ionicons name="remove" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        )}

        {/* Footer: Logout in Full mode */}
        {user && isFull && (
          <View
            style={[
              styles.footerBlock,
              { borderTopColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)' },
            ]}
          >
            <TouchableOpacity
              style={styles.logoutBtn}
              onPress={() => logout()}
              activeOpacity={0.7}
            >
              <Ionicons
                name="log-out-outline"
                size={18}
                color={colors.textSecondary}
                style={{ marginRight: 8 }}
              />
              <Text style={[styles.logoutText, { color: colors.textSecondary }]}>
                {t('logout')}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  polymorphicContainer: {
    overflow: 'hidden',
    position: 'relative',
  },
  edgeGrabberZone: {
    position: 'absolute',
    top: 70,
    bottom: 70,
    right: 0,
    width: 6,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
    ...(Platform.OS === 'web' ? ({ touchAction: 'none' } as any) : {}),
  },
  edgeGrabberPill: {
    width: 3,
    height: 28,
    borderRadius: 1.5,
    opacity: 0.3,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    position: 'relative',
  },
  brandGroupTouch: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoWrapper: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  wordmarkContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    maxWidth: 0,
    opacity: 0,
    ...(Platform.OS === 'web' ? ({ whiteSpace: 'nowrap' } as any) : {}),
  },
  logoHugo: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  logoMusic: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginLeft: 4,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    overflow: 'hidden',
    maxWidth: 0,
    opacity: 0,
    pointerEvents: 'none',
  },
  headerToolBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubblePartyDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  morphBody: {
    flex: 1,
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
  },
  glassDivider: {
    width: '80%',
    alignSelf: 'center',
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    marginVertical: 6,
  },
  profileRowTouch: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'transparent',
    alignSelf: 'center',
    width: '92%',
  },
  profileDetails: {
    flex: 1,
    marginLeft: 8,
    marginRight: 4,
    overflow: 'hidden',
    maxWidth: 0,
    opacity: 0,
  },
  profileNickname: {
    fontSize: 13.5,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  profileRole: {
    fontSize: 11,
    marginTop: 1,
  },
  navScrollView: {
    flex: 1,
    width: '100%',
    paddingHorizontal: 0,
  },
  sectionContainer: {
    marginBottom: 8,
    width: '100%',
    alignItems: 'center',
  },
  sectionHeading: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.6,
    paddingHorizontal: 12,
    marginVertical: 4,
    alignSelf: 'flex-start',
  },
  navItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8.5,
    paddingHorizontal: 12,
    borderRadius: 14,
    marginVertical: 3.5,
    borderWidth: 1.5,
    borderColor: 'transparent',
    overflow: 'hidden',
    width: '92%',
    alignSelf: 'center',
  },
  navItemRowRail: {
    width: 42,
    height: 42,
    paddingHorizontal: 0,
    paddingVertical: 0,
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 13,
  },
  navItemIcon: {
    width: 28,
    textAlign: 'center',
  },
  navItemIconRail: {
    width: 24,
    textAlign: 'center',
  },
  labelWrapper: {
    flex: 1,
    overflow: 'hidden',
    marginLeft: 4,
    maxWidth: 0,
    opacity: 0,
  },
  navItemText: {
    fontSize: 13.5,
    fontWeight: '500',
    letterSpacing: -0.2,
  },
  navItemTextActive: {
    fontWeight: '700',
  },
  partyBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
    marginLeft: 4,
  },
  partyBadgeDotRail: {
    position: 'absolute',
    top: 6,
    right: 6,
    marginLeft: 0,
    borderWidth: 1,
    borderColor: '#ffffff',
  },
  railBottomDock: {
    paddingVertical: 8,
    alignItems: 'center',
    gap: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.15)',
  },
  railBottomBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerBlock: {
    paddingTop: 8,
    paddingHorizontal: 14,
    paddingBottom: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  logoutText: {
    fontSize: 13,
    fontWeight: '500',
  },
});
