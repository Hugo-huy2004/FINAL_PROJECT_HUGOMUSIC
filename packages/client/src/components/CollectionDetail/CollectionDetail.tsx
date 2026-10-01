import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Image, Pressable, Animated, useWindowDimensions, Platform } from 'react-native';
import ChromeScrollView from '../../ui/ChromeScrollView';
import { useStore, Song } from '../../store/useStore';
import { useAppTheme } from '../../ui/theme';
import { useIsMobile } from '../../lib/responsive';
import { formatTime } from '../../lib/format';
import { isHexColor, isLight, shade, withAlpha } from '../../lib/color';
import CoverArt, { resolveImageUri, isRealCover } from '../CoverArt';
import { GlassButton, GlassCapsule, CapsuleButton, useDroplet, SwipeBack } from '../../ui/kit';
import { openSongActions, openCollectionActions, SongMenu } from '../SongActions/SongActions';
import { Gradient, Icon } from 'hugo-music';

// Details page for a collection (album, playlist, artist...) according to Apple Music iOS 26:
// - DYED background according to the main color of the cover image (`tint`, calculated by server — ReleaseJob); The text automatically changes to black/white
// according to that color brightness; If there is no color, use the cover photo to blur it;
// - cover photo overflows to the top of the page, fading into the background; glass button: ‹ left, [action | …] right;
// - name, artist, info line (`meta`: genre · year), button row: mix · ▶ Play · like;
// - introduction of 2 lines + MORE; list of songs numbered according to actual tracks (`numbered`).
// Web: cover image fades with mask; native doesn't have MaskedView yet so it overlays the gradient with the same background color.
const HERO_MASK = Platform.OS === 'web'
  ? ({ maskImage: 'linear-gradient(to bottom, #000 60%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to bottom, #000 60%, transparent 100%)' } as object)
  : null;

type Action = { icon: keyof typeof Icon.glyphMap; label: string; onPress: () => void; danger?: boolean };

/** Full detail screen for an album, playlist, chart or mix: hero artwork, actions and the song list. */
export default function CollectionDetail({
  kind, title, subtitle, coverUri, songs, onBack, heroArt, about, onRemoveSong, actions = [], emptyText, tint, meta, numbered = false, onMoveSong,
}: {
  /** Kind of collection; drives labels and the hero layout. */
  kind: string; title: string; subtitle: string; coverUri?: string; songs: Song[]; onBack: () => void;
  heroArt?: (size: number) => React.ReactNode; // separate header image (e.g. heart for My Playlist)
  /** Optional description shown under the title. */
  about?: string;                               // introduction (release description, artist bio)
  /** Enables removing songs (playlists). */
  onRemoveSong?: (song: Song) => void;          // Yes → menu "..." of each article shows "Remove from this list"
  actions?: Action[];                           // add button in the right corner glass (eg delete list)
  emptyText?: string;
  tint?: string;                                // cover photo main color (#rrggbb)
  meta?: string;                                // "Electronic · 2008"
  /** Shows track numbers instead of artwork. */
  numbered?: boolean;                           // numbering by song.album.trackNo (album) instead of order
  /** Shows up/down controls to reorder songs. */
  onMoveSong?: (song: Song, dir: -1 | 1) => void; // has → sort mode: each song has a ▲▼ button instead of "..."
}) {
  const theme = useAppTheme();
  const isMobile = useIsMobile();
  const { width } = useWindowDimensions();
  const playSong = useStore((s) => s.playSong);
  const shufflePlay = useStore((s) => s.shufflePlay);
  const playOrToggleSong = useStore((s) => s.playOrToggleSong);
  const currentSong = useStore((s) => s.currentSong);
  const isPlaying = useStore((s) => s.isPlaying);
  const likedSongIds = useStore((s) => s.likedSongIds);
  const toggleLike = useStore((s) => s.toggleLike);
  const [expanded, setExpanded] = useState(false);

  // Page color palette: according to the cover image if there is color, otherwise according to the light/dark interface.
  const palette = useMemo(() => {
    if (isHexColor(tint)) {
      const light = isLight(tint);
      const ink = light ? '#111111' : '#FFFFFF';
      return {
        top: tint, bottom: shade(tint, light ? -0.25 : -0.6), ink,
        dim: withAlpha(light ? '#000000' : '#FFFFFF', 0.62), line: withAlpha(light ? '#000000' : '#FFFFFF', 0.14),
        pill: ink, pillInk: light ? '#FFFFFF' : '#111111',
      };
    }
    return {
      top: theme.colors.background, bottom: theme.colors.background, ink: theme.colors.text,
      dim: theme.colors.textSecondary, line: theme.colors.border,
      pill: theme.isDark ? '#FFFFFF' : '#111111', pillInk: theme.isDark ? '#111111' : '#FFFFFF',
    };
  }, [tint, theme]);

  const heroSize = isMobile ? width : 300;
  const image = isRealCover(coverUri) ? resolveImageUri(coverUri) : undefined;
  const totalMinutes = useMemo(() => Math.round(songs.reduce((sum, s) => sum + (s.duration || 0), 0) / 60), [songs]);
  const playingThis = !!currentSong && songs.some((s) => s._id === currentSong._id) && isPlaying;
  const allLiked = songs.length > 0 && songs.every((s) => likedSongIds.includes(s._id));
  const info = [meta, `${songs.length} bài`, totalMinutes ? `${totalMinutes} phút` : null].filter(Boolean).join(' · ');

  const play = () => (playingThis ? playOrToggleSong(currentSong!, songs) : songs[0] && playSong(songs[0], songs));
  const likeAll = () => songs.filter((s) => likedSongIds.includes(s._id) === allLiked).forEach((s) => toggleLike(s._id));

  const circle = (icon: keyof typeof Icon.glyphMap, label: string, onPress: () => void, color = palette.ink) => (
    <GlassButton icon={icon} label={label} onPress={onPress} color={color} size={48} iconSize={20} />
  );
  const playDrop = useDroplet(0.8);

  return (
    <SwipeBack onBack={onBack}>
    <View style={styles.root}>
      {isHexColor(tint) ? (
        <Gradient colors={[palette.top, palette.bottom]} style={StyleSheet.absoluteFill} />
      ) : (
        <>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.background }]} />
          {image && <Image source={{ uri: image }} style={StyleSheet.absoluteFill} blurRadius={Platform.OS === 'web' ? 60 : 40} resizeMode="cover" />}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.isDark ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.62)' }]} />
        </>
      )}

      <ChromeScrollView contentContainerStyle={{ paddingBottom: isMobile ? 200 : 120 }} showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, !isMobile && styles.heroDesktop]}>
          <View style={[{ width: heroSize, height: heroSize }, isMobile ? HERO_MASK : styles.desktopCover]}>
            {heroArt ? heroArt(heroSize) : <CoverArt uri={coverUri} title={title} size={heroSize} radius={isMobile ? 0 : 14} />}
            {isMobile && Platform.OS !== 'web' && (
              <Gradient colors={['rgba(0,0,0,0)', palette.top]} style={[styles.heroFade, { pointerEvents: 'none' }]} />
            )}
          </View>
          <View style={[styles.titleBlock, isMobile && { marginTop: -56 }]}>
            <Text style={[styles.kind, { color: palette.dim }]}>{kind}</Text>
            <Text style={[styles.title, { color: palette.ink }]} numberOfLines={2}>{title}</Text>
            <Text style={[styles.artist, { color: palette.ink }]} numberOfLines={1}>{subtitle}</Text>
            <Text style={[styles.meta, { color: palette.dim }]} numberOfLines={1}>{info}</Text>
            <View style={styles.actions}>
              {circle('shuffle', 'Trộn bài', () => shufflePlay(songs))}
              <Animated.View style={playDrop.style}>
                <Pressable
                  onPress={play}
                  onPressIn={playDrop.onPressIn}
                  onPressOut={playDrop.onPressOut}
                  disabled={!songs.length}
                  style={[styles.playPill, { backgroundColor: palette.pill }]}
                  accessibilityRole="button"
                  accessibilityLabel={playingThis ? 'Tạm dừng' : `Phát ${title}`}
                >
                  <Icon name={playingThis ? 'pause' : 'play'} size={20} color={palette.pillInk} />
                  <Text style={[styles.playText, { color: palette.pillInk }]}>{playingThis ? 'Tạm dừng' : 'Phát'}</Text>
                </Pressable>
              </Animated.View>
              {circle(allLiked ? 'heart' : 'heart-outline', allLiked ? 'Bỏ thích tất cả' : 'Thích tất cả', likeAll, allLiked ? '#FF375F' : palette.ink)}
            </View>
          </View>
        </View>

        <View style={[styles.list, !isMobile && styles.listDesktop]}>
          {about ? (
            <Pressable onPress={() => setExpanded((e) => !e)} style={styles.about} accessibilityRole="button" accessibilityLabel={expanded ? 'Thu gọn giới thiệu' : 'Xem thêm giới thiệu'}>
              <Text style={[styles.aboutText, { color: palette.dim }]} numberOfLines={expanded ? undefined : 2}>{about}</Text>
              <Text style={[styles.more, { color: palette.ink }]}>{expanded ? 'ẨN BỚT' : 'THÊM'}</Text>
            </Pressable>
          ) : null}
          {songs.length === 0 && <Text style={[styles.empty, { color: palette.dim }]}>{emptyText || 'Chưa có bài nào.'}</Text>}
          {songs.map((song, i) => {
            const current = currentSong?._id === song._id;
            const no = numbered ? song.album?.trackNo ?? i + 1 : i + 1;
            const remove = onRemoveSong ? () => onRemoveSong(song) : undefined;
            return (
              <View key={song._id} style={[styles.row, { borderBottomColor: palette.line }]}>
                <SongMenu song={song} onRemove={remove}>
                <Pressable
                  onPress={() => playOrToggleSong(song, songs)}
                  style={({ pressed }) => [styles.rowMain, pressed && { opacity: 0.6 }]}
                  accessibilityRole="button"
                  accessibilityLabel={`${song.title}, ${song.artist}`}
                >
                  <View style={styles.no}>
                    {current ? (
                      <Icon name={isPlaying ? 'stats-chart' : 'pause'} size={14} color={palette.ink} />
                    ) : (
                      <Text style={[styles.noText, { color: palette.dim }]}>{no}</Text>
                    )}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.rowTitle, { color: palette.ink }, current && { fontWeight: '700' }]} numberOfLines={1}>{song.title}</Text>
                    {(!numbered || song.artist !== subtitle) && (
                      <Text style={[styles.rowSub, { color: palette.dim }]} numberOfLines={1}>{song.artist} · {formatTime(song.duration || 0)}</Text>
                    )}
                  </View>
                </Pressable>
                </SongMenu>
                {onMoveSong ? (
                  <View style={{ flexDirection: 'row' }}>
                    {([[-1, 'chevron-up', 'Đưa lên'], [1, 'chevron-down', 'Đưa xuống']] as const).map(([dir, icon, label]) => {
                      const disabled = (dir === -1 && i === 0) || (dir === 1 && i === songs.length - 1);
                      return (
                        <Pressable key={dir} onPress={() => onMoveSong(song, dir)} disabled={disabled} style={[styles.rowMore, disabled && { opacity: 0.25 }]} hitSlop={6} accessibilityRole="button" accessibilityLabel={`${label} ${song.title}`}>
                          <Icon name={icon} size={20} color={palette.ink} />
                        </Pressable>
                      );
                    })}
                  </View>
                ) : (
                <Pressable
                  onPress={() => openSongActions(song, remove ? { onRemove: remove } : {})}
                  style={styles.rowMore}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Tuỳ chọn cho ${song.title}`}
                >
                  <Icon name="ellipsis-horizontal" size={18} color={palette.dim} />
                </Pressable>
                )}
              </View>
            );
          })}
        </View>
      </ChromeScrollView>

      {/* Glass embossed button: ‹ (left) · [private operation | …] (Right). */}
      <View style={[styles.topBar, { pointerEvents: 'box-none' }]}>
        <GlassButton icon="chevron-back" iconSize={24} nudge={-2} label="Quay lại" onPress={onBack} color={palette.ink} />
        <GlassCapsule>
          {actions.map((a) => (
            <CapsuleButton key={a.label} icon={a.icon} label={a.label} onPress={a.onPress} color={a.danger ? '#FF453A' : palette.ink} iconSize={19} />
          ))}
          <CapsuleButton
            icon="ellipsis-horizontal"
            label="Tuỳ chọn cho cả tập: thích, thêm vào danh sách phát, tải về, chia sẻ"
            onPress={() => songs.length && openCollectionActions({ title, subtitle, cover: coverUri, songs })}
            color={palette.ink}
            iconSize={19}
          />
        </GlassCapsule>
      </View>
    </View>
    </SwipeBack>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  hero: { alignItems: 'center' },
  heroDesktop: { paddingTop: 72 },
  heroFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '45%' },
  desktopCover: {
    borderRadius: 14, overflow: 'hidden',
    boxShadow: '0px 14px 56px rgba(0,0,0,0.3)',
  },
  titleBlock: { alignItems: 'center', paddingHorizontal: 24, marginTop: 18, alignSelf: 'stretch' },
  kind: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  title: { fontSize: 24, fontWeight: '800', letterSpacing: -0.4, textAlign: 'center', marginTop: 4 },
  artist: { fontSize: 18, fontWeight: '500', textAlign: 'center', marginTop: 2 },
  meta: { fontSize: 12, marginTop: 6, textAlign: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 16 },
  playPill: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, minWidth: 150, paddingHorizontal: 28, borderRadius: 24 },
  playText: { fontSize: 17, fontWeight: '700' },
  list: { paddingHorizontal: 18, marginTop: 20 },
  listDesktop: { maxWidth: 820, width: '100%', alignSelf: 'center' },
  about: { marginBottom: 14 },
  aboutText: { fontSize: 14, lineHeight: 20 },
  more: { fontSize: 13, fontWeight: '800', marginTop: 4 },
  empty: { fontSize: 14, paddingVertical: 16 },
  row: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, minHeight: 52 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  no: { width: 24, alignItems: 'center' },
  noText: { fontSize: 15, fontVariant: ['tabular-nums'] },
  rowTitle: { fontSize: 16 },
  rowSub: { fontSize: 13, marginTop: 2 },
  rowMore: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  topBar: { position: 'absolute', top: 12, left: 14, right: 14, flexDirection: 'row', justifyContent: 'space-between' },
});
