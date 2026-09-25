import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Platform,
  useWindowDimensions,
  ScrollView,
  Animated,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore, Song } from '../store/useStore';
import { formatTime } from '../utils/format';
import { resolveImageUri } from '../components/CoverArt';
import { getStationCover } from '../utils/radioArtwork';
import { api } from '../utils/api';
import { useAppTheme } from '../theme/theme';
import { useTranslation } from '../i18n/i18n';
import { audioEngine } from '../utils/audioEngine';

interface LyricLine {
  time: number;
  text: string;
}

function parseSyncedLyrics(lrc: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const raw of lrc.split('\n')) {
    const match = raw.match(/^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/);
    if (!match) continue;
    const minutes = parseInt(match[1], 10);
    const seconds = parseFloat(match[2]);
    const text = match[3].trim();
    if (text) lines.push({ time: minutes * 60 + seconds, text });
  }
  return lines.sort((a, b) => a.time - b.time);
}

function synthesizeKaraokeLines(plainLyrics: string, songDuration: number): LyricLine[] {
  const rawLines = plainLyrics
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (rawLines.length === 0) return [];

  const totalLines = rawLines.length;
  const safeDuration = Math.max(songDuration || 180, totalLines * 4);
  const startOffset = Math.min(8, safeDuration * 0.05);
  const availableTime = Math.max(10, safeDuration - startOffset - 12);
  const timePerLine = availableTime / totalLines;

  return rawLines.map((text, idx) => ({
    time: Math.round((startOffset + idx * timePerLine) * 10) / 10,
    text,
  }));
}

function updateSpring(
  s: { current: number; target: number; velocity: number },
  stiffness: number,
  damping: number,
  dt: number
): boolean {
  const displacement = s.current - s.target;
  const springForce = -stiffness * displacement;
  const dampingForce = -damping * s.velocity;
  const acceleration = springForce + dampingForce;
  s.velocity += acceleration * dt;
  s.current += s.velocity * dt;
  if (Math.abs(displacement) < 0.1 && Math.abs(s.velocity) < 0.1) {
    s.current = s.target;
    s.velocity = 0;
    return true;
  }
  return false;
}

function updateSpringVal(
  obj: any,
  key: string,
  stiffness: number,
  damping: number,
  dt: number,
  threshold: number = 0.005
): boolean {
  const current = obj[key];
  const target = obj[key + 'Target'] !== undefined ? obj[key + 'Target'] : obj.target;
  const velKey = key + 'Velocity' in obj ? key + 'Velocity' : 'velocity';
  let vel = obj[velKey];

  const displacement = current - target;
  const springForce = -stiffness * displacement;
  const dampingForce = -damping * vel;
  const acceleration = springForce + dampingForce;

  vel += acceleration * dt;
  obj[velKey] = vel;
  obj[key] += vel * dt;

  if (Math.abs(displacement) < threshold && Math.abs(vel) < threshold) {
    obj[key] = target;
    obj[velKey] = 0;
    return true;
  }
  return false;
}

interface AdaptiveColors {
  primary: string;
  secondary: string;
  darkest: string;
  accent: string;
  glow: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  containerBg: string;
}

function computeFallbackHarmonicPalette(title: string = '', artist: string = '', category: string = '', isDark: boolean = true): AdaptiveColors {
  const combined = `${title} ${artist} ${category}`.toLowerCase();

  let baseHue = 210; // Default oceanic
  if (combined.includes('phụng vụ') || combined.includes('thánh ca') || combined.includes('choral')) {
    baseHue = 270; // Royal sacred purple
  } else if (combined.includes('hòa tấu') || combined.includes('classical') || combined.includes('piano')) {
    baseHue = 215; // Timeless midnight blue
  } else if (combined.includes('podcast') || combined.includes('radio')) {
    baseHue = 290; // Rich amethyst plum
  } else if (combined.includes('lofi') || combined.includes('chill') || combined.includes('acoustic')) {
    baseHue = 158; // Emerald forest / sage
  } else if (combined.includes('rock') || combined.includes('metal') || combined.includes('disturbed') || combined.includes('fire')) {
    baseHue = 350; // Deep crimson ember
  } else if (combined.includes('nhạc trẻ') || combined.includes('v-pop') || combined.includes('pop')) {
    baseHue = 330; // Vibrant electric rose
  } else {
    const hash = combined.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    baseHue = hash % 360;
  }

  if (!isDark) {
    return {
      primary: `hsl(${baseHue}, 80%, 88%)`,
      secondary: `hsl(${(baseHue + 35) % 360}, 60%, 94%)`,
      darkest: `hsl(${baseHue}, 40%, 98%)`,
      accent: `hsl(${baseHue}, 85%, 45%)`,
      glow: `hsla(${baseHue}, 85%, 60%, 0.15)`,
      textPrimary: '#111827',
      textSecondary: '#4B5563',
      textTertiary: '#9CA3AF',
      containerBg: '#F3F4F6',
    };
  }

  return {
    primary: `hsl(${baseHue}, 75%, 20%)`,
    secondary: `hsl(${(baseHue + 35) % 360}, 65%, 10%)`,
    darkest: `hsl(${baseHue}, 60%, 4%)`,
    accent: `hsl(${baseHue}, 85%, 65%)`,
    glow: `hsla(${baseHue}, 85%, 60%, 0.45)`,
    textPrimary: '#ffffff',
    textSecondary: 'rgba(255, 255, 255, 0.65)',
    textTertiary: 'rgba(255, 255, 255, 0.35)',
    containerBg: '#09090c',
  };
}

export interface HugoFullPlayerProps {
  onClose: () => void;
  initialTab?: 'art' | 'lyrics';
}

export default function HugoFullPlayer({ onClose, initialTab = 'art' }: HugoFullPlayerProps) {
  const currentSong = useStore((state) => state.currentSong);
  const isPlaying = useStore((state) => state.isPlaying);
  const togglePlay = useStore((state) => state.togglePlay);
  const position = useStore((state) => state.position);
  const duration = useStore((state) => state.duration);
  const seek = useStore((state) => state.seek);
  const next = useStore((state) => state.next);
  const prev = useStore((state) => state.prev);
  const likedSongIds = useStore((state) => state.likedSongIds);
  const toggleLike = useStore((state) => state.toggleLike);
  const queue = useStore((state) => state.queue);
  const playSong = useStore((state) => state.playSong);
  const partyRoom = useStore((state) => state.partyRoom);
  const { colors, isDark } = useAppTheme();
  const { t } = useTranslation();

  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  // Responsive mode: Desktop / Tablet widescreen >= 860px (Image 1), Mobile portrait < 860px (Image 2)
  const isDesktop = width >= 860;

  // View mode for mobile: 'art' (Screen 1) or 'lyrics' (Screen 2)
  const [mobileView, setMobileView] = useState<'art' | 'lyrics'>(initialTab === 'lyrics' ? 'lyrics' : 'art');
  const effectiveCoverArt = currentSong
    ? resolveImageUri(currentSong.coverArt) || getStationCover(currentSong as any)
    : '';

  const [adaptiveColors, setAdaptiveColors] = useState<AdaptiveColors>(() =>
    computeFallbackHarmonicPalette(currentSong?.title, currentSong?.artist, currentSong?.category, isDark)
  );
  const [showShareModal, setShowShareModal] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<'off' | 'all' | 'one'>('off');

  // Linear scrubber drag state
  const [isDragging, setIsDragging] = useState(false);
  const [dragProgress, setDragProgress] = useState<number | null>(null);

  // Volume state
  const [volume, setVolume] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);

  // Lyrics state
  const lyricsScrollRef = useRef<ScrollView>(null);
  const [lyricsState, setLyricsState] = useState<{
    loading: boolean;
    plainLyrics: string | null;
    syncedLines: LyricLine[] | null;
  }>({ loading: false, plainLyrics: null, syncedLines: null });

  // Tactile animation springs for buttons
  const playScale = useRef(new Animated.Value(1)).current;
  const prevScale = useRef(new Animated.Value(1)).current;
  const nextScale = useRef(new Animated.Value(1)).current;
  const artScale = useRef(new Animated.Value(1)).current;

  // 120fps Water Droplet Burst Spring Physics Engine ("Hiệu ứng giọt nước bung to ra full màn")
  const rootContainerRef = useRef<any>(null);
  const playerCanvasRef = useRef<any>(null);
  const playerRafRef = useRef<number | null>(null);
  const [showShockwave, setShowShockwave] = useState(true);

  // Droplet morph spring: progress (0 = compact drop at bottom player -> 1 = burst full screen)
  const dropletSpring = useRef({
    progress: 0.04,
    target: 1,
    velocity: 2.5,
    scale: 0.3,
    scaleTarget: 1,
    scaleVelocity: 2.0,
    borderRadius: 9999,
    borderRadiusTarget: 0,
    borderRadiusVelocity: -16000,
  }).current;

  const applyDropletDOM = useCallback(() => {
    if (Platform.OS !== 'web') return;
    const el = rootContainerRef.current;
    if (!el) return;

    const p = Math.max(0, Math.min(1.2, dropletSpring.progress));
    const s = Math.max(0.1, dropletSpring.scale);
    const r = Math.max(0, dropletSpring.borderRadius);

    // Liquid droplet circular clip-path expanding outward from the bottom player position
    const clipRadius = Math.max(8, p * 160);
    el.style.clipPath = `circle(${clipRadius}% at 50% 92%)`;
    el.style.webkitClipPath = `circle(${clipRadius}% at 50% 92%)`;
    el.style.borderRadius = `${r}px`;
    el.style.transform = `scale(${s}) translate3d(0, ${(1 - Math.min(1, p)) * 30}px, 0)`;
    el.style.transformOrigin = '50% 92%';
    el.style.opacity = `${Math.min(1, p * 2.2)}`;
    if (p < 0.96) {
      el.style.filter = `blur(${Math.max(0, (1 - p) * 10)}px)`;
    } else {
      el.style.filter = 'none';
    }
  }, [dropletSpring]);

  const startDropletSpring = useCallback(
    (onFinish?: () => void) => {
      if (playerRafRef.current !== null) {
        cancelAnimationFrame(playerRafRef.current);
        playerRafRef.current = null;
      }
      let lastTime: number | null = null;
      const loop = (ts: number) => {
        if (lastTime === null) lastTime = ts;
        const dt = Math.min((ts - lastTime) / 1000, 0.025);
        lastTime = ts;

        // Sub-critically damped Hooke's Law spring physics for liquid droplet bounce
        const pSettled = updateSpringVal(dropletSpring, 'progress', 220, 18.5, dt, 0.004);
        const sSettled = updateSpringVal(dropletSpring, 'scale', 200, 16.5, dt, 0.004);
        const rSettled = updateSpringVal(dropletSpring, 'borderRadius', 240, 20.0, dt, 1.5);

        applyDropletDOM();

        if (!pSettled || !sSettled || !rSettled) {
          playerRafRef.current = requestAnimationFrame(loop);
        } else {
          playerRafRef.current = null;
          if (onFinish) onFinish();
        }
      };
      playerRafRef.current = requestAnimationFrame(loop);
    },
    [dropletSpring, applyDropletDOM]
  );

  // Trigger water droplet burst expansion immediately on mount
  useEffect(() => {
    dropletSpring.progress = 0.04;
    dropletSpring.target = 1;
    dropletSpring.velocity = 2.5;
    dropletSpring.scale = 0.3;
    dropletSpring.scaleTarget = 1;
    dropletSpring.scaleVelocity = 2.0;
    dropletSpring.borderRadius = 9999;
    dropletSpring.borderRadiusTarget = 0;
    dropletSpring.borderRadiusVelocity = -16000;

    startDropletSpring();

    const shockTimer = setTimeout(() => setShowShockwave(false), 850);
    return () => clearTimeout(shockTimer);
  }, [startDropletSpring, dropletSpring]);

  // Smooth collapse: contracts back into round water droplet at bottom player position
  const handleSmoothClose = useCallback(() => {
    if (Platform.OS !== 'web') {
      onClose();
      return;
    }
    dropletSpring.target = 0;
    dropletSpring.velocity = -2.8;
    dropletSpring.scaleTarget = 0.25;
    dropletSpring.scaleVelocity = -2.2;
    dropletSpring.borderRadiusTarget = 9999;
    dropletSpring.borderRadiusVelocity = 16000;

    startDropletSpring(() => {
      onClose();
    });
  }, [onClose, dropletSpring, startDropletSpring]);

  // Swipe-down dismiss tracking for mobile grabber/header with interactive liquid droplet deformation
  const isDraggingDismissRef = useRef(false);
  const dismissStartRef = useRef<{ clientY: number; time: number; hasMoved: boolean }>({
    clientY: 0,
    time: 0,
    hasMoved: false,
  });

  const handleGrabberPointerDown = (e: any) => {
    if (Platform.OS !== 'web') return;
    if (e.button !== undefined && e.button !== 0) return;
    isDraggingDismissRef.current = true;
    dismissStartRef.current = {
      clientY: e.clientY,
      time: performance.now(),
      hasMoved: false,
    };

    if (playerRafRef.current !== null) {
      cancelAnimationFrame(playerRafRef.current);
      playerRafRef.current = null;
    }

    const onDismissMove = (moveEv: PointerEvent) => {
      if (!isDraggingDismissRef.current) return;
      const dy = moveEv.clientY - dismissStartRef.current.clientY;
      if (!dismissStartRef.current.hasMoved) {
        if (Math.abs(dy) > 5) dismissStartRef.current.hasMoved = true;
        else return;
      }
      moveEv.preventDefault();
      // Interactive pull: water drop starts rounding and scaling toward bottom
      const pullProgress = Math.max(0.08, 1 - dy / 380);
      dropletSpring.progress = pullProgress;
      dropletSpring.target = pullProgress;
      dropletSpring.scale = 0.3 + pullProgress * 0.7;
      dropletSpring.scaleTarget = dropletSpring.scale;
      dropletSpring.borderRadius = (1 - pullProgress) * 450;
      dropletSpring.borderRadiusTarget = dropletSpring.borderRadius;

      applyDropletDOM();
    };

    const onDismissUp = (upEv: PointerEvent) => {
      window.removeEventListener('pointermove', onDismissMove);
      window.removeEventListener('pointerup', onDismissUp);
      window.removeEventListener('pointercancel', onDismissUp);
      if (!isDraggingDismissRef.current) return;
      isDraggingDismissRef.current = false;

      const dy = upEv.clientY - dismissStartRef.current.clientY;
      const dt = Math.max(1, performance.now() - dismissStartRef.current.time);
      const vy = dy / dt;

      if (dy > 90 || vy > 0.35) {
        handleSmoothClose();
      } else {
        // Snap back out to full screen droplet
        dropletSpring.target = 1;
        dropletSpring.scaleTarget = 1;
        dropletSpring.borderRadiusTarget = 0;
        startDropletSpring();
      }
    };

    window.addEventListener('pointermove', onDismissMove, { passive: false });
    window.addEventListener('pointerup', onDismissUp, { passive: false });
    window.addEventListener('pointercancel', onDismissUp, { passive: false });
  };

  // 100% Automatic Adaptive Color Extraction from Album Art & Song Mood
  useEffect(() => {
    if (!currentSong) return;
    const fallback = computeFallbackHarmonicPalette(
      currentSong.title,
      currentSong.artist,
      currentSong.category,
      isDark
    );
    setAdaptiveColors(fallback);

    if (Platform.OS === 'web' && effectiveCoverArt) {
      try {
        const img = new (window as any).Image();
        img.crossOrigin = 'anonymous';
        img.src = effectiveCoverArt;
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = 6;
            canvas.height = 6;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            ctx.drawImage(img, 0, 0, 6, 6);
            const data = ctx.getImageData(0, 0, 6, 6).data;

            let bestR = 40, bestG = 30, bestB = 90;
            let maxSat = -1;
            for (let i = 0; i < data.length; i += 4) {
              const r = data[i], g = data[i + 1], b = data[i + 2];
              const max = Math.max(r, g, b), min = Math.min(r, g, b);
              const sat = max === 0 ? 0 : (max - min) / max;
              if (sat > maxSat && max > 35 && max < 240) {
                maxSat = sat;
                bestR = r;
                bestG = g;
                bestB = b;
              }
            }

            let pR, pG, pB, sR, sG, sB, dR, dG, dB;
            
            if (!isDark) {
              // Light Mode: mix with white to create pastel colors
              pR = Math.round(bestR * 0.4 + 255 * 0.6);
              pG = Math.round(bestG * 0.4 + 255 * 0.6);
              pB = Math.round(bestB * 0.4 + 255 * 0.6);

              sR = Math.round(bestR * 0.2 + 255 * 0.8);
              sG = Math.round(bestG * 0.2 + 255 * 0.8);
              sB = Math.round(bestB * 0.2 + 255 * 0.8);

              dR = Math.round(bestR * 0.1 + 255 * 0.9);
              dG = Math.round(bestG * 0.1 + 255 * 0.9);
              dB = Math.round(bestB * 0.1 + 255 * 0.9);

              setAdaptiveColors({
                primary: `rgb(${pR}, ${pG}, ${pB})`,
                secondary: `rgb(${sR}, ${sG}, ${sB})`,
                darkest: `rgb(${dR}, ${dG}, ${dB})`,
                accent: `rgb(${bestR}, ${bestG}, ${bestB})`,
                glow: `rgba(${bestR}, ${bestG}, ${bestB}, 0.2)`,
                textPrimary: '#111827',
                textSecondary: '#4B5563',
                textTertiary: '#9CA3AF',
                containerBg: '#F3F4F6',
              });
            } else {
              // Dark Mode: mix with black
              pR = Math.round(bestR * 0.72);
              pG = Math.round(bestG * 0.72);
              pB = Math.round(bestB * 0.72);

              sR = Math.round(bestR * 0.28);
              sG = Math.round(bestG * 0.28);
              sB = Math.round(bestB * 0.28);

              dR = Math.round(bestR * 0.08);
              dG = Math.round(bestG * 0.08);
              dB = Math.round(bestB * 0.08);

              setAdaptiveColors({
                primary: `rgb(${pR}, ${pG}, ${pB})`,
                secondary: `rgb(${sR}, ${sG}, ${sB})`,
                darkest: `rgb(${dR}, ${dG}, ${dB})`,
                accent: `rgb(${bestR}, ${bestG}, ${bestB})`,
                glow: `rgba(${bestR}, ${bestG}, ${bestB}, 0.48)`,
                textPrimary: '#ffffff',
                textSecondary: 'rgba(255, 255, 255, 0.65)',
                textTertiary: 'rgba(255, 255, 255, 0.35)',
                containerBg: '#09090c',
              });
            }
          } catch {
            // CORS fallback already set
          }
        };
      } catch {
        // Fallback already set
      }
    }
  }, [currentSong?._id, effectiveCoverArt]);

  // Subtle breathing pulse on album art while playing
  useEffect(() => {
    if (isPlaying) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(artScale, {
            toValue: 1.015,
            duration: 2800,
            useNativeDriver: Platform.OS !== 'web',
          }),
          Animated.timing(artScale, {
            toValue: 1.0,
            duration: 2800,
            useNativeDriver: Platform.OS !== 'web',
          }),
        ])
      ).start();
    } else {
      artScale.stopAnimation();
      artScale.setValue(1.0);
    }
  }, [isPlaying]);

  // Fetch lyrics
  useEffect(() => {
    if (!currentSong) return;
    setLyricsState({ loading: true, plainLyrics: null, syncedLines: null });
    api
      .getLyrics(currentSong._id)
      .then((res) => {
        let parsedLines: LyricLine[] | null = null;
        if (res.syncedLyrics && res.syncedLyrics.trim().length > 0) {
          parsedLines = parseSyncedLyrics(res.syncedLyrics);
        } else if (res.plainLyrics && res.plainLyrics.trim().length > 0) {
          parsedLines = synthesizeKaraokeLines(res.plainLyrics, currentSong.duration || 180);
        }
        setLyricsState({
          loading: false,
          plainLyrics: res.plainLyrics,
          syncedLines: parsedLines && parsedLines.length > 0 ? parsedLines : null,
        });
      })
      .catch(() => setLyricsState({ loading: false, plainLyrics: null, syncedLines: null }));
  }, [currentSong?._id, currentSong?.duration]);

  // Calculate active synced line based on position
  const activeSyncedLineIndex = useMemo(() => {
    const lines = lyricsState.syncedLines;
    if (!lines || lines.length === 0) return -1;
    let idx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].time <= position) idx = i;
      else break;
    }
    return idx;
  }, [lyricsState.syncedLines, position]);

  // Auto-scroll lyrics to keep active line centered
  useEffect(() => {
    if (activeSyncedLineIndex >= 0 && lyricsScrollRef.current) {
      lyricsScrollRef.current.scrollTo({
        y: Math.max(0, activeSyncedLineIndex * 48 - (isDesktop ? 160 : 120)),
        animated: true,
      });
    }
  }, [activeSyncedLineIndex, isDesktop]);

  // Upcoming track info for mobile lyrics screen "COMING UP NEXT"
  const nextTrack = useMemo(() => {
    if (!currentSong) return {} as Song;
    const currentIdx = queue.findIndex((s) => s._id === currentSong._id);
    if (currentIdx !== -1 && currentIdx + 1 < queue.length) {
      return queue[currentIdx + 1];
    }
    return queue[0] || currentSong;
  }, [queue, currentSong]);

  if (!currentSong) return null;

  const rawProgress = duration > 0 ? Math.min(1, Math.max(0, position / duration)) : 0;
  const activeProgress = isDragging && dragProgress !== null ? dragProgress : rawProgress;
  const activePosition = activeProgress * (duration > 0 ? duration : 0);
  const remainingSeconds = Math.max(0, (duration || 0) - activePosition);
  const isLiked = likedSongIds.includes(currentSong._id);

  // ---------------------------------------------------------------------------
  // Button Spring Press Animation
  // ---------------------------------------------------------------------------
  const triggerSpringPress = (animVal: Animated.Value) => {
    Animated.sequence([
      Animated.timing(animVal, { toValue: 0.86, duration: 60, useNativeDriver: Platform.OS !== 'web' }),
      Animated.spring(animVal, { toValue: 1.0, friction: 3.5, tension: 60, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  };

  const handleTogglePlay = () => {
    triggerSpringPress(playScale);
    togglePlay();
  };

  const handleNext = () => {
    triggerSpringPress(nextScale);
    next();
  };

  const handlePrev = () => {
    triggerSpringPress(prevScale);
    prev();
  };

  // ---------------------------------------------------------------------------
  // Linear Scrubber Drag Seeking
  // ---------------------------------------------------------------------------
  const handleScrubberMouseDown = (e: any) => {
    if (Platform.OS !== 'web' || !isFinite(duration) || duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const getRatio = (clientX: number) => Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));

    setIsDragging(true);
    setDragProgress(getRatio(e.clientX));

    const onMouseMove = (moveEv: MouseEvent) => {
      moveEv.preventDefault();
      setDragProgress(getRatio(moveEv.clientX));
    };

    const onMouseUp = (upEv: MouseEvent) => {
      const finalRatio = getRatio(upEv.clientX);
      seek(finalRatio * duration);
      setIsDragging(false);
      setDragProgress(null);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // ---------------------------------------------------------------------------
  // Volume Controls (Desktop Image 1)
  // ---------------------------------------------------------------------------
  const handleVolumeMouseDown = (e: any) => {
    if (Platform.OS !== 'web') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const getRatio = (clientX: number) => Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));

    const newVol = getRatio(e.clientX);
    setVolume(newVol);
    setIsMuted(false);
    audioEngine.setVolume(newVol);

    const onMouseMove = (moveEv: MouseEvent) => {
      const v = getRatio(moveEv.clientX);
      setVolume(v);
      audioEngine.setVolume(v);
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleToggleMute = () => {
    if (isMuted) {
      setIsMuted(false);
      audioEngine.setVolume(volume || 0.85);
    } else {
      setIsMuted(true);
      audioEngine.setVolume(0);
    }
  };

  return (
    <View
      ref={rootContainerRef}
      style={[
        styles.container,
        { backgroundColor: adaptiveColors.containerBg },
        Platform.OS === 'web' &&
          ({
            transformOrigin: '50% 92%',
            overflow: 'hidden',
          } as any),
      ]}
      // @ts-ignore
      className="water-droplet-burst-container"
    >
      {/* 0. Liquid Water Droplet Expanding Shockwave Ripple */}
      {showShockwave && (
        <View
          // @ts-ignore
          className="water-droplet-shockwave"
        />
      )}
      {/* 1. Dynamic Ambient Chromatic Gradient Background */}
      {Platform.OS === 'web' ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `radial-gradient(ellipse at 35% 45%, ${adaptiveColors.primary} 0%, ${adaptiveColors.secondary} 55%, ${adaptiveColors.darkest} 100%)`,
            filter: 'blur(54px)',
            transform: 'scale(1.2)',
            transition: 'background 0.85s cubic-bezier(0.16, 1, 0.3, 1)',
            zIndex: 0,
          }}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: adaptiveColors.secondary }]} />
      )}


      {/* 2. Global Blurred Background Image (Matches Album Cover for Immersive Depth) */}
      {effectiveCoverArt && (
        <>
          <Animated.Image
            source={{ uri: effectiveCoverArt }}
            style={[
              StyleSheet.absoluteFill,
              {
                opacity: 0.85,
                transform: [{ scale: 1.4 }],
                ...(Platform.OS === 'web' ? { filter: 'blur(60px) saturate(160%)' } : {}),
              } as any,
            ]}
            blurRadius={Platform.OS === 'ios' ? 55 : 35}
            resizeMode="cover"
          />
          {/* Base darkening using the adaptive darkest color */}
          <View 
            style={[
              StyleSheet.absoluteFill, 
              { backgroundColor: adaptiveColors.darkest, opacity: 0.55, zIndex: 1 }
            ]} 
          />
          {/* Depth gradient (darker at bottom for UI legibility) */}
          <View 
            style={[
              StyleSheet.absoluteFill, 
              { 
                zIndex: 1,
                ...(Platform.OS === 'web' ? {
                  backgroundImage: 'linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.45) 55%, rgba(0,0,0,0.92) 100%)'
                } : { backgroundColor: 'rgba(0,0,0,0.4)' })
              } as any
            ]} 
          />
        </>
      )}

      {/* 3. Main Player View Canvas (with 120fps requestAnimationFrame spring exit) */}
      <View
        ref={playerCanvasRef}
        style={[
          styles.playerCanvas,
          {
            paddingTop: Math.max(insets.top, isDesktop ? 24 : 10),
            paddingBottom: Math.max(insets.bottom, isDesktop ? 24 : 14),
          },
        ]}
      >
        {/* ================================================================= */}
        {/* DESKTOP / TABLET WIDESCREEN VIEW (MATCHES IMAGE 1)                */}
        {/* ================================================================= */}
        {isDesktop ? (
          <View style={styles.desktopWrapper}>
            {/* Top Navigation Bar: [✕] Close on left, [🖥️ Cast / ⋮] on right */}
            <View style={styles.desktopTopBar}>
              <TouchableOpacity
                onPress={handleSmoothClose}
                style={styles.circleIconBtn}
                activeOpacity={0.7}
                accessibilityLabel="Close Player"
              >
                <Ionicons name="close" size={24} color={adaptiveColors.textPrimary} />
              </TouchableOpacity>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {partyRoom && (
                  <View style={styles.partyBadge}>
                    <View style={styles.partyLiveDot} />
                    <Text style={styles.partyBadgeText}>Party #{partyRoom.code}</Text>
                  </View>
                )}
                <TouchableOpacity
                  onPress={() => setShowShareModal(true)}
                  style={styles.circleIconBtn}
                  activeOpacity={0.7}
                  accessibilityLabel="Share Song"
                >
                  <Ionicons name="share-outline" size={20} color={adaptiveColors.textPrimary} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Desktop Two-Column Layout (Cover Art & Controls Left, Synced Lyrics Right) */}
            <View style={styles.desktopTwoColumn}>
              {/* Left Column: Square Album Artwork & Complete Controls */}
              <View style={styles.desktopLeftCol}>
                {/* Square Album Artwork */}
                <Animated.View
                  style={[
                    styles.desktopArtContainer,
                    {
                      transform: [{ scale: artScale }],
                      boxShadow: `0 24px 60px rgba(0, 0, 0, 0.7), 0 0 35px ${adaptiveColors.glow}`,
                    } as any,
                  ]}
                >
                  {effectiveCoverArt ? (
                    <Image
                      source={{ uri: effectiveCoverArt }}
                      style={styles.desktopArtImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.desktopArtPlaceholder}>
                      <Ionicons name="musical-notes" size={72} color="rgba(255,255,255,0.45)" />
                    </View>
                  )}
                </Animated.View>

                {/* Song Meta Row: Title & Favorite/Options */}
                <View style={styles.desktopMetaRow}>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={[styles.desktopSongTitle, { color: adaptiveColors.textPrimary }]} numberOfLines={1}>
                      {currentSong.title}
                    </Text>
                    <Text style={[styles.desktopArtistAlbum, { color: adaptiveColors.textPrimary }]} numberOfLines={1}>
                      {currentSong.artist} — {currentSong.category || currentSong.genre || 'Single'}
                    </Text>
                  </View>

                  <View style={styles.desktopActionTools}>
                    {/* Star / Like Button */}
                    <TouchableOpacity
                      onPress={() => toggleLike(currentSong._id)}
                      style={styles.desktopToolBtn}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={isLiked ? 'star' : 'star-outline'}
                        size={22}
                        color={isLiked ? '#F59E0B' : 'rgba(255, 255, 255, 0.85)'}
                      />
                    </TouchableOpacity>

                    {/* Three Dots Menu */}
                    <TouchableOpacity
                      onPress={() => setShowShareModal(true)}
                      style={styles.desktopToolBtn}
                      activeOpacity={0.7}
                      accessibilityLabel="Share Song"
                    >
                      <Ionicons name="ellipsis-horizontal" size={22} color="rgba(255, 255, 255, 0.85)" />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Linear Scrubber Track (1:00 on left, -2:37 on right) */}
                <View style={styles.scrubberContainer}>
                  <View
                    style={styles.scrubberTrack}
                    // @ts-ignore
                    onMouseDown={handleScrubberMouseDown}
                  >
                    <View style={[styles.scrubberFill, { width: `${activeProgress * 100}%` }]} />
                    <View
                      style={[styles.scrubberThumb, { left: `${activeProgress * 100}%` }]}
                      // @ts-ignore
                      className="circular-thumb-glow"
                    />
                  </View>

                  <View style={styles.timeRow}>
                    <Text style={[styles.timeText, { color: adaptiveColors.textPrimary }]}>{formatTime(activePosition)}</Text>
                    <Text style={[styles.timeText, { color: adaptiveColors.textPrimary }]}>-{formatTime(remainingSeconds)}</Text>
                  </View>
                </View>

                {/* Playback Controls: Shuffle, Prev, Play/Pause, Next, Repeat */}
                <View style={styles.desktopControlsRow}>
                  {/* Shuffle */}
                  <TouchableOpacity
                    onPress={() => setIsShuffle(!isShuffle)}
                    style={styles.controlBtn}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="shuffle-outline"
                      size={20}
                      color={isShuffle ? '#10B981' : 'rgba(255, 255, 255, 0.55)'}
                    />
                  </TouchableOpacity>

                  {/* Previous */}
                  <Animated.View style={{ transform: [{ scale: prevScale }] }}>
                    <TouchableOpacity onPress={handlePrev} style={styles.controlBtn} activeOpacity={0.7}>
                      <Ionicons name="play-skip-back-sharp" size={26} color={adaptiveColors.textPrimary} />
                    </TouchableOpacity>
                  </Animated.View>

                  {/* Big Play / Pause Button */}
                  <Animated.View style={{ transform: [{ scale: playScale }] }}>
                    <TouchableOpacity
                      onPress={handleTogglePlay}
                      style={styles.desktopPlayPauseBtn}
                      activeOpacity={0.85}
                    >
                      {isPlaying ? (
                        <View style={styles.pauseDoubleBars}>
                          <View style={styles.pauseBar} />
                          <View style={styles.pauseBar} />
                        </View>
                      ) : (
                        <Ionicons name="play" size={32} color={adaptiveColors.textPrimary} style={{ marginLeft: 3 }} />
                      )}
                    </TouchableOpacity>
                  </Animated.View>

                  {/* Next */}
                  <Animated.View style={{ transform: [{ scale: nextScale }] }}>
                    <TouchableOpacity onPress={handleNext} style={styles.controlBtn} activeOpacity={0.7}>
                      <Ionicons name="play-skip-forward-sharp" size={26} color={adaptiveColors.textPrimary} />
                    </TouchableOpacity>
                  </Animated.View>

                  {/* Repeat */}
                  <TouchableOpacity
                    onPress={() => setRepeatMode(repeatMode === 'off' ? 'all' : repeatMode === 'all' ? 'one' : 'off')}
                    style={styles.controlBtn}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={repeatMode === 'one' ? 'repeat' : 'repeat-outline'}
                      size={20}
                      color={repeatMode !== 'off' ? '#10B981' : 'rgba(255, 255, 255, 0.55)'}
                    />
                  </TouchableOpacity>
                </View>

                {/* Volume Slider Bar with Speaker Icon */}
                <View style={styles.desktopVolumeRow}>
                  <TouchableOpacity onPress={handleToggleMute} activeOpacity={0.7} style={{ marginRight: 10 }}>
                    <Ionicons
                      name={isMuted || volume === 0 ? 'volume-mute-outline' : 'volume-low-outline'}
                      size={19}
                      color="rgba(255, 255, 255, 0.7)"
                    />
                  </TouchableOpacity>

                  <View
                    style={styles.volumeTrack}
                    // @ts-ignore
                    onMouseDown={handleVolumeMouseDown}
                  >
                    <View style={[styles.volumeFill, { width: `${(isMuted ? 0 : volume) * 100}%` }]} />
                    <View style={[styles.volumeThumb, { left: `${(isMuted ? 0 : volume) * 100}%` }]} />
                  </View>
                </View>
              </View>

              {/* Right Column: Live Synced Karaoke Lyrics (matching Image 1) */}
              <View style={styles.desktopRightCol}>
                {lyricsState.loading ? (
                  <View style={styles.lyricsLoadingBox}>
                    <ActivityIndicator size="large" color={adaptiveColors.textPrimary} />
                    <Text style={[styles.lyricsLoadingText, { color: adaptiveColors.textSecondary }]}>{t('loadingLyrics') || 'Loading Lyrics...'}</Text>
                  </View>
                ) : lyricsState.syncedLines && lyricsState.syncedLines.length > 0 ? (
                  <ScrollView
                    ref={lyricsScrollRef}
                    style={styles.lyricsScrollDesktop}
                    contentContainerStyle={{ paddingVertical: 140 }}
                    showsVerticalScrollIndicator={false}
                  >
                    {lyricsState.syncedLines.map((line, idx) => {
                      const isActive = idx === activeSyncedLineIndex;
                      return (
                        <TouchableOpacity
                          key={idx}
                          onPress={() => seek(line.time)}
                          activeOpacity={0.8}
                          style={styles.lyricLineContainer}
                        >
                          <Text
                            style={[
                              styles.desktopLyricText,
                              isActive && styles.desktopLyricTextActive,
                              !isActive && { opacity: 0.35 },
                            ]}
                          >
                            {line.text}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                ) : lyricsState.plainLyrics ? (
                  <ScrollView style={styles.lyricsScrollDesktop} contentContainerStyle={{ paddingVertical: 80 }}>
                    <Text style={[styles.desktopLyricText, { opacity: 0.75, lineHeight: 36 }]}>
                      {lyricsState.plainLyrics}
                    </Text>
                  </ScrollView>
                ) : (
                  <View style={styles.noLyricsBox}>
                    <Ionicons name="chatbubble-ellipses-outline" size={48} color="rgba(255,255,255,0.25)" />
                    <Text style={[styles.noLyricsText, { color: adaptiveColors.textSecondary }]}>No lyrics available for this song</Text>
                  </View>
                )}

                {/* Bottom-right speech bubble indicator icon (matching Image 1) */}
                <View style={styles.desktopBottomRightBadge}>
                  <TouchableOpacity
                    style={styles.lyricsBubbleBtn}
                    activeOpacity={0.8}
                    onPress={() => setMobileView('lyrics')}
                  >
                    <Ionicons name="chatbubble-ellipses" size={20} color={adaptiveColors.textPrimary} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        ) : (
          /* ================================================================= */
          /* MOBILE PHONE PORTRAIT VIEW (MATCHES IMAGE 2)                      */
          /* ================================================================= */
          <View style={styles.mobileWrapper}>
            {/* Top Grabber Handle Bar for smooth swipe-down dismiss */}
            <View
              style={styles.topGrabberContainer}
              // @ts-ignore
              onPointerDown={handleGrabberPointerDown}
            >
              <View style={styles.topGrabberBar} />
            </View>

            {/* Mobile Top Header: [∨] on left, Playlist title center, [⋯] on right */}
            <View
              style={styles.mobileTopHeader}
              // @ts-ignore
              onPointerDown={handleGrabberPointerDown}
            >
              <TouchableOpacity
                onPress={handleSmoothClose}
                style={styles.mobileHeaderBtn}
                activeOpacity={0.7}
                accessibilityLabel="Close Player"
              >
                <Ionicons name="chevron-down" size={26} color={adaptiveColors.textPrimary} />
              </TouchableOpacity>

              <View style={styles.mobileHeaderCenter}>
                {mobileView === 'lyrics' ? (
                  <>
                    <Text style={[styles.mobileHeaderEyebrow, { color: adaptiveColors.textSecondary }]}>COMING UP NEXT</Text>
                    <Text style={[styles.mobileHeaderSubtitle, { color: adaptiveColors.textSecondary }]} numberOfLines={1}>
                      {nextTrack.title} — {nextTrack.artist}
                    </Text>
                  </>
                ) : (
                  <Text style={[styles.mobileHeaderTitle, { color: adaptiveColors.textPrimary }]} numberOfLines={1}>
                    {currentSong.category || currentSong.genre || 'Work Playlist'}
                  </Text>
                )}
              </View>

              <TouchableOpacity
                onPress={() => setShowShareModal(true)}
                style={styles.mobileHeaderBtn}
                activeOpacity={0.7}
                accessibilityLabel="Share Song"
              >
                <Ionicons name="ellipsis-horizontal" size={22} color={adaptiveColors.textPrimary} />
              </TouchableOpacity>
            </View>

            {/* Mobile View Switcher: Artwork View (Screen 1) vs Full Synced Lyrics (Screen 2) */}
            {mobileView === 'art' ? (
              /* SCREEN 1: Centered Square Artwork & Full Controls */
              <View style={styles.mobileArtBody}>
                {/* Square Album Cover with Smooth Breathing Animation */}
                <Animated.View
                  style={[
                    styles.mobileArtWrapper,
                    {
                      width: Math.min(width - 48, 340),
                      height: Math.min(width - 48, 340),
                      transform: [{ scale: artScale }],
                      boxShadow: `0 24px 55px rgba(0, 0, 0, 0.72), 0 0 35px ${adaptiveColors.glow}`,
                    } as any,
                  ]}
                >
                  {effectiveCoverArt ? (
                    <Image source={{ uri: effectiveCoverArt }} style={styles.mobileArtImage} resizeMode="cover" />
                  ) : (
                    <View style={styles.mobileArtPlaceholder}>
                      <Ionicons name="musical-notes" size={64} color="rgba(255,255,255,0.45)" />
                    </View>
                  )}
                </Animated.View>

                {/* Song Meta Info Row with Heart on Right */}
                <View style={styles.mobileMetaRow}>
                  <View style={{ flex: 1, marginRight: 14 }}>
                    <Text style={[styles.mobileSongTitle, { color: adaptiveColors.textPrimary }]} numberOfLines={1}>
                      {currentSong.title}
                    </Text>
                    <Text style={[styles.mobileArtistText, { color: adaptiveColors.textPrimary }]} numberOfLines={1}>
                      {currentSong.artist}
                    </Text>
                  </View>

                  <TouchableOpacity
                    onPress={() => toggleLike(currentSong._id)}
                    style={styles.mobileLikeBtn}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={isLiked ? 'heart' : 'heart-outline'}
                      size={26}
                      color={isLiked ? '#FF2D55' : 'rgba(255, 255, 255, 0.85)'}
                    />
                  </TouchableOpacity>
                </View>

                {/* Full-width Linear Scrubber */}
                <View style={styles.mobileScrubberSection}>
                  <View
                    style={styles.mobileScrubberTrack}
                    // @ts-ignore
                    onMouseDown={handleScrubberMouseDown}
                  >
                    <View style={[styles.scrubberFill, { width: `${activeProgress * 100}%` }]} />
                    <View
                      style={[styles.scrubberThumb, { left: `${activeProgress * 100}%` }]}
                      // @ts-ignore
                      className="circular-thumb-glow"
                    />
                  </View>

                  <View style={styles.timeRow}>
                    <Text style={[styles.timeText, { color: adaptiveColors.textPrimary }]}>{formatTime(activePosition)}</Text>
                    <Text style={[styles.timeText, { color: adaptiveColors.textPrimary }]}>-{formatTime(remainingSeconds)}</Text>
                  </View>
                </View>

                {/* Playback Controls Row */}
                <View style={styles.mobileControlsRow}>
                  {/* Shuffle */}
                  <TouchableOpacity
                    onPress={() => setIsShuffle(!isShuffle)}
                    style={styles.mobileControlSmall}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="shuffle-outline"
                      size={22}
                      color={isShuffle ? '#10B981' : 'rgba(255, 255, 255, 0.6)'}
                    />
                  </TouchableOpacity>

                  {/* Previous */}
                  <Animated.View style={{ transform: [{ scale: prevScale }] }}>
                    <TouchableOpacity onPress={handlePrev} style={styles.mobileControlBtn} activeOpacity={0.7}>
                      <Ionicons name="play-skip-back-sharp" size={28} color={adaptiveColors.textPrimary} />
                    </TouchableOpacity>
                  </Animated.View>

                  {/* Big Play / Pause Button in Circle */}
                  <Animated.View style={{ transform: [{ scale: playScale }] }}>
                    <TouchableOpacity
                      onPress={handleTogglePlay}
                      style={styles.mobilePlayCircleBtn}
                      activeOpacity={0.85}
                    >
                      {isPlaying ? (
                        <View style={styles.mobilePauseBars}>
                          <View style={styles.mobilePauseBar} />
                          <View style={styles.mobilePauseBar} />
                        </View>
                      ) : (
                        <Ionicons name="play" size={32} color="#000000" style={{ marginLeft: 3 }} />
                      )}
                    </TouchableOpacity>
                  </Animated.View>

                  {/* Next */}
                  <Animated.View style={{ transform: [{ scale: nextScale }] }}>
                    <TouchableOpacity onPress={handleNext} style={styles.mobileControlBtn} activeOpacity={0.7}>
                      <Ionicons name="play-skip-forward-sharp" size={28} color={adaptiveColors.textPrimary} />
                    </TouchableOpacity>
                  </Animated.View>

                  {/* Lyrics Toggle Button */}
                  <TouchableOpacity
                    onPress={() => setMobileView('lyrics')}
                    style={styles.mobileControlSmall}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="chatbubble-ellipses-outline" size={22} color="rgba(255, 255, 255, 0.6)" />
                  </TouchableOpacity>
                </View>

                {/* Bottom Bar: Device Info on left, Share & Queue on right */}
                <View style={styles.mobileBottomBar}>
                  <View style={styles.deviceInfoPill}>
                    <Ionicons name="desktop-outline" size={14} color="#34D399" style={{ marginRight: 6 }} />
                    <Text style={styles.deviceInfoText} numberOfLines={1}>
                      Hugo Web Audio
                    </Text>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                    {/* Share Button (opens Screen 3 Aesthetic Story Modal) */}
                    <TouchableOpacity
                      onPress={() => setShowShareModal(true)}
                      style={styles.bottomIconTouch}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="share-outline" size={20} color="rgba(255, 255, 255, 0.85)" />
                    </TouchableOpacity>

                    {/* Queue / Lyrics Button */}
                    <TouchableOpacity
                      onPress={() => setMobileView('lyrics')}
                      style={styles.bottomIconTouch}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="list-outline" size={22} color="rgba(255, 255, 255, 0.85)" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ) : (
              /* SCREEN 2: Full Mobile Synced Lyrics View */
              <View style={styles.mobileLyricsBody}>
                {lyricsState.loading ? (
                  <View style={styles.lyricsLoadingBox}>
                    <ActivityIndicator size="large" color={adaptiveColors.textPrimary} />
                    <Text style={[styles.lyricsLoadingText, { color: adaptiveColors.textSecondary }]}>{t('loadingLyrics') || 'Loading Lyrics...'}</Text>
                  </View>
                ) : lyricsState.syncedLines && lyricsState.syncedLines.length > 0 ? (
                  <ScrollView
                    ref={lyricsScrollRef}
                    style={styles.mobileLyricsScroll}
                    contentContainerStyle={{ paddingVertical: 120, paddingHorizontal: 20 }}
                    showsVerticalScrollIndicator={false}
                  >
                    {lyricsState.syncedLines.map((line, idx) => {
                      const isActive = idx === activeSyncedLineIndex;
                      return (
                        <TouchableOpacity
                          key={idx}
                          onPress={() => seek(line.time)}
                          activeOpacity={0.8}
                          style={{ marginVertical: 10 }}
                        >
                          <Text
                            style={[
                              styles.mobileLyricLineText,
                              isActive && styles.mobileLyricLineActive,
                              !isActive && { opacity: 0.32 },
                            ]}
                          >
                            {line.text}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                ) : lyricsState.plainLyrics ? (
                  <ScrollView style={styles.mobileLyricsScroll} contentContainerStyle={{ padding: 24 }}>
                    <Text style={[styles.mobileLyricLineText, { opacity: 0.75, lineHeight: 34 }]}>
                      {lyricsState.plainLyrics}
                    </Text>
                  </ScrollView>
                ) : (
                  <View style={styles.noLyricsBox}>
                    <Ionicons name="chatbubble-ellipses-outline" size={44} color="rgba(255,255,255,0.25)" />
                    <Text style={[styles.noLyricsText, { color: adaptiveColors.textSecondary }]}>No lyrics available</Text>
                  </View>
                )}

                {/* Mobile Bottom Mini Player Dock */}
                <View style={styles.mobileLyricsDock}>
                  {/* Mini Progress Bar */}
                  <View
                    style={styles.miniScrubberTrack}
                    // @ts-ignore
                    onMouseDown={handleScrubberMouseDown}
                  >
                    <View style={[styles.scrubberFill, { width: `${activeProgress * 100}%` }]} />
                  </View>

                  <View style={styles.mobileLyricsDockRow}>
                    <TouchableOpacity
                      onPress={() => setMobileView('art')}
                      style={styles.mobileDockArtBtn}
                      activeOpacity={0.8}
                    >
                      {effectiveCoverArt ? (
                        <Image source={{ uri: effectiveCoverArt }} style={styles.miniDockThumb} resizeMode="cover" />
                      ) : (
                        <View style={styles.miniDockThumbPlaceholder}>
                          <Ionicons name="musical-notes" size={16} color={adaptiveColors.textPrimary} />
                        </View>
                      )}
                      <View style={{ marginLeft: 10, flex: 1 }}>
                        <Text style={[styles.miniDockTitle, { color: adaptiveColors.textPrimary }]} numberOfLines={1}>
                          {currentSong.title}
                        </Text>
                        <Text style={[styles.miniDockArtist, { color: adaptiveColors.textSecondary }]} numberOfLines={1}>
                          {currentSong.artist}
                        </Text>
                      </View>
                    </TouchableOpacity>

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                      <TouchableOpacity onPress={handleTogglePlay} style={styles.miniDockPlayBtn} activeOpacity={0.8}>
                        <Ionicons name={isPlaying ? 'pause' : 'play'} size={20} color="#000000" />
                      </TouchableOpacity>

                      <TouchableOpacity onPress={handleNext} activeOpacity={0.7}>
                        <Ionicons name="play-skip-forward-sharp" size={22} color={adaptiveColors.textPrimary} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </View>
            )}
          </View>
        )}
      </View>

      {/* ================================================================= */}
      {/* SCREEN 3: AESTHETIC STORY SHARE MODAL (MATCHES IMAGE 2 SCREEN 3)   */}
      {/* ================================================================= */}
      <Modal visible={showShareModal} animationType="slide" transparent>
        <View style={styles.shareModalOverlay}>
          <View style={[styles.shareModalCard, { backgroundColor: adaptiveColors.containerBg, borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.1)' }]}>
            {/* Modal Top Bar */}
            <View style={styles.shareCardHeader}>
              <TouchableOpacity onPress={() => setShowShareModal(false)} activeOpacity={0.7}>
                <Ionicons name="chevron-back" size={24} color={adaptiveColors.textPrimary} />
              </TouchableOpacity>
              <View style={{ alignItems: 'center' }}>
                <Text style={[styles.shareHeaderEyebrow, { color: adaptiveColors.textSecondary }]}>SHARING TO</Text>
                <Text style={[styles.shareHeaderTitle, { color: adaptiveColors.textPrimary }]}>Instagram Stories</Text>
              </View>
              <TouchableOpacity onPress={() => setShowShareModal(false)} activeOpacity={0.7}>
                <Ionicons name="ellipsis-horizontal" size={20} color={adaptiveColors.textPrimary} />
              </TouchableOpacity>
            </View>

            {/* Aesthetic Story Art Badge */}
            <View style={styles.storyCardGraphic}>
              <View style={styles.storySpotifyBadge}>
                <Ionicons name="disc" size={20} color="#10B981" />
                <Text style={[styles.storyListeningText, { color: adaptiveColors.textSecondary }]}>LISTENING NOW</Text>
              </View>

              {effectiveCoverArt && (
                <Image source={{ uri: effectiveCoverArt }} style={styles.storyArtworkThumb} resizeMode="cover" />
              )}

              <Text style={[styles.storySongTitle, { color: adaptiveColors.textPrimary }]} numberOfLines={2}>
                {currentSong.title}
              </Text>
              <Text style={[styles.storyArtistName, { color: adaptiveColors.textSecondary }]}>{currentSong.artist}</Text>

              {/* Sound Wave Graphic */}
              <View style={styles.soundWaveRow}>
                {[12, 24, 18, 30, 20, 14, 28, 16, 22, 10, 26, 18].map((h, i) => (
                  <View key={i} style={[styles.soundWaveBar, { height: h }]} />
                ))}
              </View>
              <Text style={[styles.storyScanText, { color: adaptiveColors.textPrimary }]}>SCAN FOR FULL EXPERIENCE</Text>
            </View>

            {/* Action Buttons */}
            <Text style={styles.shareInstructionText}>
              Share this aesthetic vibe directly to your stories or save to gallery.
            </Text>

            <TouchableOpacity
              style={[styles.postInstagramBtn, { backgroundColor: isDark ? '#ffffff' : '#000000' }]}
              onPress={() => setShowShareModal(false)}
              activeOpacity={0.85}
            >
              <Ionicons name="share-social-outline" size={18} color={isDark ? "#000000" : "#ffffff"} style={{ marginRight: 8 }} />
              <Text style={[styles.postInstagramText, { color: isDark ? '#000000' : '#ffffff' }]}>Post to Instagram</Text>
            </TouchableOpacity>

            <View style={styles.shareCardRowBtns}>
              <TouchableOpacity
                style={[styles.shareSubBtn, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)' }]}
                onPress={() => setShowShareModal(false)}
                activeOpacity={0.8}
              >
                <Ionicons name="download-outline" size={16} color={adaptiveColors.textPrimary} style={{ marginRight: 6 }} />
                <Text style={[styles.shareSubBtnText, { color: adaptiveColors.textPrimary }]}>Save Image</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.shareSubBtn, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)' }]}
                onPress={() => setShowShareModal(false)}
                activeOpacity={0.8}
              >
                <Ionicons name="copy-outline" size={16} color={adaptiveColors.textPrimary} style={{ marginRight: 6 }} />
                <Text style={[styles.shareSubBtnText, { color: adaptiveColors.textPrimary }]}>Copy Link</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // backgroundColor is injected dynamically inline
    position: 'relative',
    overflow: 'hidden',
    ...(Platform.OS === 'web'
      ? ({
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 9999,
          userSelect: 'none',
        } as any)
      : {}),
  },
  playerCanvas: {
    flex: 1,
    width: '100%',
    position: 'relative',
    zIndex: 2,
    display: 'flex',
    flexDirection: 'column',
  },

  // ---------------------------------------------------------------------------
  // Desktop Widescreen Layout Styles (Image 1)
  // ---------------------------------------------------------------------------
  desktopWrapper: {
    flex: 1,
    width: '100%',
    maxWidth: 1280,
    alignSelf: 'center',
    display: 'flex',
    flexDirection: 'column',
    paddingHorizontal: 28,
  },
  desktopTopBar: {
    width: '100%',
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 10,
  },
  circleIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web'
      ? ({
          backdropFilter: 'blur(16px)',
          transition: 'background-color 0.2s ease, transform 0.2s ease',
          cursor: 'pointer',
        } as any)
      : {}),
  },
  partyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(16, 185, 129, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.45)',
  },
  partyLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
    marginRight: 6,
  },
  partyBadgeText: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '700',
  },
  desktopTwoColumn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 24,
  },
  desktopLeftCol: {
    width: 440,
    maxWidth: '46%',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    paddingRight: 32,
  },
  desktopArtContainer: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  desktopArtImage: {
    width: '100%',
    height: '100%',
  },
  desktopArtPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  desktopMetaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  desktopSongTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -0.3,
  },
  desktopArtistAlbum: {
    fontSize: 13.5,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.72)',
    marginTop: 3,
  },
  desktopActionTools: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  desktopToolBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrubberContainer: {
    width: '100%',
    marginBottom: 16,
  },
  scrubberTrack: {
    width: '100%',
    height: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderRadius: 2.5,
    position: 'relative',
    overflow: 'visible',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer', touchAction: 'none' } as any) : {}),
  },
  scrubberFill: {
    height: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 2.5,
  },
  scrubberThumb: {
    position: 'absolute',
    top: -4.5,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#ffffff',
    transform: [{ translateX: -7 }],
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  timeText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.65)',
    letterSpacing: 0.2,
  },
  desktopControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    marginBottom: 18,
  },
  controlBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  desktopPlayPauseBtn: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pauseDoubleBars: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pauseBar: {
    width: 5.5,
    height: 24,
    backgroundColor: '#ffffff',
    borderRadius: 2.5,
  },
  desktopVolumeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 4,
  },
  volumeTrack: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderRadius: 2,
    position: 'relative',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
  },
  volumeFill: {
    height: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: 2,
  },
  volumeThumb: {
    position: 'absolute',
    top: -3.5,
    width: 11,
    height: 11,
    borderRadius: 5.5,
    backgroundColor: '#ffffff',
    transform: [{ translateX: -5.5 }],
  },
  desktopRightCol: {
    flex: 1,
    height: '100%',
    paddingLeft: 44,
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
  },
  lyricsScrollDesktop: {
    flex: 1,
    width: '100%',
  },
  lyricLineContainer: {
    marginVertical: 12,
  },
  desktopLyricText: {
    fontSize: 23,
    fontWeight: '600',
    color: '#ffffff',
    lineHeight: 36,
    letterSpacing: -0.2,
    ...(Platform.OS === 'web' ? ({ transition: 'opacity 0.28s ease, font-size 0.28s ease' } as any) : {}),
  },
  desktopLyricTextActive: {
    fontSize: 29,
    fontWeight: '800',
    color: '#ffffff',
    opacity: 1,
    lineHeight: 42,
    letterSpacing: -0.5,
    textShadowColor: 'rgba(255, 255, 255, 0.45)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 18,
  },
  lyricsLoadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lyricsLoadingText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    marginTop: 12,
  },
  noLyricsBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  noLyricsText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 15,
    fontWeight: '500',
  },
  desktopBottomRightBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
  },
  lyricsBubbleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ backdropFilter: 'blur(16px)', cursor: 'pointer' } as any) : {}),
  },

  // ---------------------------------------------------------------------------
  // Mobile Portrait Layout Styles (Image 2)
  // ---------------------------------------------------------------------------
  mobileWrapper: {
    flex: 1,
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  topGrabberContainer: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 3,
    zIndex: 20,
    ...(Platform.OS === 'web' ? ({ cursor: 'grab', touchAction: 'none' } as any) : {}),
  },
  topGrabberBar: {
    width: 38,
    height: 4.5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
  },
  mobileTopHeader: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 46,
    zIndex: 10,
  },
  mobileHeaderBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobileHeaderCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  mobileHeaderTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.4,
  },
  mobileHeaderEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.55)',
    letterSpacing: 0.8,
  },
  mobileHeaderSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
    marginTop: 1,
  },
  mobileArtBody: {
    flex: 1,
    justifyContent: 'space-around',
    paddingVertical: 8,
  },
  mobileArtWrapper: {
    alignSelf: 'center',
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  mobileArtImage: {
    width: '100%',
    height: '100%',
  },
  mobileArtPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobileMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingHorizontal: 4,
  },
  mobileSongTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -0.2,
  },
  mobileArtistText: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.72)',
    marginTop: 2,
  },
  mobileLikeBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobileScrubberSection: {
    width: '100%',
    marginVertical: 10,
    paddingHorizontal: 4,
  },
  mobileScrubberTrack: {
    width: '100%',
    height: 4.5,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderRadius: 2.25,
    position: 'relative',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
  },
  mobileControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginVertical: 8,
  },
  mobileControlSmall: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobileControlBtn: {
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobilePlayCircleBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
  },
  mobilePauseBars: {
    flexDirection: 'row',
    gap: 5,
  },
  mobilePauseBar: {
    width: 5,
    height: 22,
    backgroundColor: '#000000',
    borderRadius: 2.5,
  },
  mobileBottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingTop: 8,
  },
  deviceInfoPill: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  deviceInfoText: {
    color: '#34D399',
    fontSize: 12,
    fontWeight: '600',
  },
  bottomIconTouch: {
    padding: 6,
  },

  // Mobile Lyrics Screen (Screen 2)
  mobileLyricsBody: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  mobileLyricsScroll: {
    flex: 1,
  },
  mobileLyricLineText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
    lineHeight: 36,
    letterSpacing: -0.3,
  },
  mobileLyricLineActive: {
    fontSize: 30,
    fontWeight: '800',
    color: '#ffffff',
    opacity: 1,
    lineHeight: 44,
    textShadowColor: 'rgba(255, 255, 255, 0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 16,
  },
  mobileLyricsDock: {
    backgroundColor: 'rgba(20, 20, 26, 0.88)',
    borderRadius: 20,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    ...(Platform.OS === 'web' ? ({ backdropFilter: 'blur(24px)' } as any) : {}),
  },
  miniScrubberTrack: {
    width: '100%',
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 1.5,
    marginBottom: 10,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
  },
  mobileLyricsDockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mobileDockArtBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  miniDockThumb: {
    width: 36,
    height: 36,
    borderRadius: 8,
  },
  miniDockThumbPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniDockTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
  miniDockArtist: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.65)',
    marginTop: 1,
  },
  miniDockPlayBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ---------------------------------------------------------------------------
  // Aesthetic Story Share Modal Styles (Image 2 - Screen 3)
  // ---------------------------------------------------------------------------
  shareModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    ...(Platform.OS === 'web' ? ({ backdropFilter: 'blur(20px)' } as any) : {}),
  },
  shareModalCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 24,
    backgroundColor: '#121318',
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    boxShadow: '0 24px 60px rgba(0, 0, 0, 0.8)',
  },
  shareCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  shareHeaderEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.5)',
    letterSpacing: 0.8,
  },
  shareHeaderTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
    marginTop: 1,
  },
  storyCardGraphic: {
    borderRadius: 20,
    backgroundColor: '#0c221a',
    padding: 22,
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    marginBottom: 16,
  },
  storySpotifyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  storyListeningText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#10B981',
    letterSpacing: 0.8,
  },
  storyArtworkThumb: {
    position: 'absolute',
    top: 20,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#10B981',
  },
  storySongTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#e6fff5',
    textAlign: 'center',
    marginTop: 10,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  storyArtistName: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6ee7b7',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 20,
  },
  soundWaveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 34,
    marginBottom: 10,
  },
  soundWaveBar: {
    width: 3.5,
    backgroundColor: '#6ee7b7',
    borderRadius: 2,
  },
  storyScanText: {
    fontSize: 9,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.45)',
    letterSpacing: 1,
  },
  shareInstructionText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.55)',
    textAlign: 'center',
    marginBottom: 14,
    lineHeight: 18,
  },
  postInstagramBtn: {
    width: '100%',
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  postInstagramText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '700',
  },
  shareCardRowBtns: {
    flexDirection: 'row',
    gap: 10,
  },
  shareSubBtn: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareSubBtnText: {
    color: '#ffffff',
    fontSize: 12.5,
    fontWeight: '600',
  },
});
