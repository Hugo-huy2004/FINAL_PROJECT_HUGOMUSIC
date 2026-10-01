import { useContext, useEffect, useMemo, useState } from 'react';
import { useArtistPhoto } from '../../utils/artistPhoto';
import { View, Text, StyleSheet, Pressable, Platform, useWindowDimensions } from 'react-native';
import ChromeScrollView from '../../ui/ChromeScrollView';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useStore, Song } from '../../store/useStore';
import { useAppTheme } from '../../theme/theme';
import { useIsMobile, ContentWidthContext } from '../../utils/responsive';
import { GENRE_GROUPS } from '../../utils/genreGroups';
import CoverArt from '../../components/CoverArt';
import { BackButton, LargeTitle, SearchField, GradientTile, MediaTile, Shelf, SongList } from '../../ui/kit';
import { type, space, radius, GUTTER, gradientFor } from '../../ui/tokens';

// Tìm kiếm kiểu Apple Music, tối ưu thao tác:
//  - tìm NGAY trên kho đã tải ở máy (không gọi mạng mỗi phím gõ), không phân biệt dấu;
//  - chưa gõ gì: "tìm gần đây" + duyệt theo thể loại và theo quốc gia (gộp từ tab cũ);
//  - đã gõ: kết quả hàng đầu, nghệ sĩ, rồi danh sách bài — mỗi dòng bấm là phát.
const RECENT_KEY = 'hugo:recentSearches';
const MAX_RECENT = 8;

// "Nhạc Trẻ" → "nhac tre": gõ không dấu vẫn ra.
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();

const readQueryParam = () => (Platform.OS === 'web' ? new URLSearchParams(window.location.search).get('q') ?? '' : '');
const writeQueryParam = (q: string) => {
  if (Platform.OS !== 'web') return;
  const url = new URL(window.location.href);
  if (q.trim()) url.searchParams.set('q', q);
  else url.searchParams.delete('q');
  window.history.replaceState(null, '', `${url.pathname}${url.search}`);
};

// Một "nhóm" để duyệt: nhóm thể loại lớn, một thể loại gốc, một danh mục hoặc một quốc gia.
type Group = { kind: 'genre' | 'tag' | 'category' | 'country'; key: string };
const splitGenres = (g?: string) => (g || '').split(/[;,/]/).map((x) => x.trim()).filter(Boolean);
const countBy = (values: string[]) => {
  const m = new Map<string, number>();
  for (const v of values) m.set(v, (m.get(v) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};
const inGroup = (g: Group, s: Song) =>
  g.kind === 'genre' ? !!GENRE_GROUPS.find((x) => x.key === g.key)?.match.test(s.genre || '')
  : g.kind === 'tag' ? splitGenres(s.genre).includes(g.key)
  : g.kind === 'category' ? s.category === g.key
  : s.country === g.key;

export default function SearchScreen(_: { onNavigate?: (tab: string) => void }) {
  const artistPhoto = useArtistPhoto();
  const { colors } = useAppTheme();
  const isMobile = useIsMobile();
  const { width } = useWindowDimensions();
  const measuredWidth = useContext(ContentWidthContext);
  const songs = useStore((s) => s.songs);
  const playOrToggleSong = useStore((s) => s.playOrToggleSong);
  const playSong = useStore((s) => s.playSong);
  const shufflePlay = useStore((s) => s.shufflePlay);

  const [query, setQuery] = useState(readQueryParam);
  // Đang xem một thể loại hoặc một quốc gia (bấm thẻ ở phần duyệt).
  const [group, setGroup] = useState<Group | null>(null);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(RECENT_KEY).then((v) => v && setRecent(JSON.parse(v))).catch(() => {});
  }, []);

  const change = (q: string) => {
    setQuery(q);
    setGroup(null);
    writeQueryParam(q);
  };

  const remember = (q: string) => {
    const t = q.trim();
    if (!t) return;
    const next = [t, ...recent.filter((r) => r.toLowerCase() !== t.toLowerCase())].slice(0, MAX_RECENT);
    setRecent(next);
    AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => {});
  };

  const indexed = useMemo(() => songs.map((s) => ({ song: s, text: fold(`${s.title} ${s.artist} ${s.genre || ''}`) })), [songs]);

  const results = useMemo(() => {
    const q = fold(query.trim());
    if (!q) return { songs: [] as Song[], artists: [] as Song[] };
    const words = q.split(/\s+/);
    const hit = indexed.filter((x) => words.every((w) => x.text.includes(w))).map((x) => x.song);
    // Tên bắt đầu bằng từ khoá xếp trước.
    hit.sort((a, b) => Number(!fold(a.title).startsWith(q)) - Number(!fold(b.title).startsWith(q)));
    const artistMap = new Map<string, Song>();
    for (const s of songs) if (fold(s.artist).includes(q) && !artistMap.has(s.artist)) artistMap.set(s.artist, s);
    return { songs: hit.slice(0, 60), artists: [...artistMap.values()].slice(0, 12) };
  }, [query, indexed, songs]);

  // Duyệt dựng từ dữ liệu thật: danh mục (Hòa tấu, Nhạc trẻ...), mọi thể loại gốc có ≥ 2 bài
  // (thay cho màn "Thể loại" cũ) và quốc gia.
  const categories = useMemo(() => countBy(songs.map((s) => s.category || '').filter(Boolean)), [songs]);
  const tags = useMemo(() => countBy(songs.flatMap((s) => splitGenres(s.genre))).filter(([, n]) => n >= 2), [songs]);
  const countries = useMemo(() => countBy(songs.map((s) => s.country || '').filter(Boolean)), [songs]);

  const groupTitle = group?.kind === 'genre' ? GENRE_GROUPS.find((g) => g.key === group.key)?.label : group?.key;
  const groupSongs = useMemo(() => (group ? songs.filter((s) => inGroup(group, s)) : []), [group, songs]);

  const play = (song: Song, list: Song[]) => {
    remember(query);
    playOrToggleSong(song, list);
  };

  // Bề rộng thẻ tính từ vùng nội dung ĐO THẬT: hàng cuối lẻ vẫn thẳng cột, không bị giãn ra hai mép.
  const inner = (measuredWidth ?? width) - GUTTER * 2;
  const columns = isMobile ? 2 : Math.max(3, Math.floor((inner + space.md) / (200 + space.md)));
  const tileWidth = Math.floor((inner - space.md * (columns - 1)) / columns);
  const q = query.trim();
  const top = results.artists[0] && fold(results.artists[0].artist).startsWith(fold(q)) ? results.artists[0] : results.songs[0];

  return (
    <View style={{ flex: 1 }}>
      <LargeTitle title="Tìm kiếm" />
      <View style={styles.searchBar}>
        <SearchField value={query} onChangeText={change} placeholder="Bài hát, nghệ sĩ, thể loại" />
      </View>

      <ChromeScrollView contentContainerStyle={{ paddingBottom: 200 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {q ? (
          results.songs.length === 0 && results.artists.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="search" size={40} color={colors.textTertiary} />
              <Text style={[type.title3, { color: colors.text, marginTop: space.md }]}>Không tìm thấy “{q}”</Text>
              <Text style={[type.subhead, { color: colors.textSecondary, marginTop: space.xs, textAlign: 'center' }]}>
                Thử từ khoá khác, hoặc duyệt theo thể loại.
              </Text>
            </View>
          ) : (
            <>
              {top && (
                <View style={styles.section}>
                  <Text style={[type.title3, { color: colors.text, marginBottom: space.sm }]}>Kết quả hàng đầu</Text>
                  <Pressable
                    onPress={() => play(top, results.songs.length ? results.songs : [top])}
                    style={({ pressed }) => [styles.topCard, { backgroundColor: colors.surface }, pressed && { opacity: 0.85 }]}
                    accessibilityRole="button"
                  >
                    <CoverArt uri={top.coverArt} title={top.title} size={84} radius={top === results.artists[0] ? 42 : radius.md} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[type.title2, { color: colors.text }]} numberOfLines={2}>
                        {top === results.artists[0] ? top.artist : top.title}
                      </Text>
                      <Text style={[type.subhead, { color: colors.textSecondary }]}>
                        {top === results.artists[0] ? 'Nghệ sĩ' : `Bài hát · ${top.artist}`}
                      </Text>
                    </View>
                    <View style={[styles.playFab, { backgroundColor: colors.accent }]}>
                      <Ionicons name="play" size={20} color="#fff" style={{ marginLeft: 2 }} />
                    </View>
                  </Pressable>
                </View>
              )}

              {results.artists.length > 0 && (
                <Shelf title="Nghệ sĩ" gap={16}>
                  {results.artists.map((a) => (
                    <MediaTile key={a.artist} round uri={artistPhoto(a.artist)} title={a.artist} size={96} onPress={() => change(a.artist)} />
                  ))}
                </Shelf>
              )}

              {results.songs.length > 0 && (
                <View style={styles.section}>
                  <Text style={[type.title3, { color: colors.text, marginBottom: space.xs }]}>Bài hát</Text>
                  <SongList songs={results.songs} subtitle={(s) => `Bài hát · ${s.artist}`} onPlay={(s) => play(s, results.songs)} />
                </View>
              )}
            </>
          )
        ) : group ? (
          <View style={styles.section}>
            <View style={{ marginLeft: -GUTTER, marginBottom: space.sm }}><BackButton onPress={() => setGroup(null)} label="Duyệt" /></View>
            <Text style={[type.title1, { color: colors.text }]}>{groupTitle}</Text>
            <Text style={[type.subhead, { color: colors.textSecondary }]}>{groupSongs.length} bài</Text>
            <View style={styles.actions}>
              <Pressable style={[styles.action, { backgroundColor: colors.fill }]} onPress={() => groupSongs[0] && playSong(groupSongs[0], groupSongs)} accessibilityRole="button">
                <Ionicons name="play" size={18} color={colors.accent} />
                <Text style={[type.headline, { color: colors.accent }]}>Phát</Text>
              </Pressable>
              <Pressable style={[styles.action, { backgroundColor: colors.fill }]} onPress={() => shufflePlay(groupSongs)} accessibilityRole="button">
                <Ionicons name="shuffle" size={18} color={colors.accent} />
                <Text style={[type.headline, { color: colors.accent }]}>Trộn bài</Text>
              </Pressable>
            </View>
            <SongList songs={groupSongs} />
          </View>
        ) : (
          <>
            {recent.length > 0 && (
              <View style={styles.section}>
                <View style={styles.rowBetween}>
                  <Text style={[type.title3, { color: colors.text }]}>Tìm gần đây</Text>
                  <Pressable onPress={() => { setRecent([]); AsyncStorage.removeItem(RECENT_KEY).catch(() => {}); }} accessibilityRole="button" hitSlop={10}>
                    <Text style={[type.subhead, { color: colors.accent }]}>Xoá</Text>
                  </Pressable>
                </View>
                <View style={styles.chips}>
                  {recent.map((r) => (
                    <Pressable key={r} onPress={() => change(r)} style={[styles.chip, { backgroundColor: colors.fill }]} accessibilityRole="button">
                      <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
                      <Text style={[type.subhead, { color: colors.text }]}>{r}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            <View style={styles.section}>
              <Text style={[type.title3, { color: colors.text, marginBottom: space.md }]}>Duyệt theo thể loại</Text>
              <View style={styles.grid}>
                {GENRE_GROUPS.map((g) => (
                  <GradientTile
                    key={g.key}
                    title={g.label}
                    subtitle={`${songs.filter((s) => g.match.test(s.genre || '')).length} bài`}
                    colors={g.colors}
                    width={tileWidth}
                    height={isMobile ? 104 : 120}
                    onPress={() => setGroup({ kind: 'genre', key: g.key })}
                  />
                ))}
              </View>
              {tags.length > 0 && (
                <View style={[styles.chips, { marginTop: space.md }]}>
                  {tags.map(([tag, n]) => (
                    <Pressable key={tag} onPress={() => setGroup({ kind: 'tag', key: tag })} style={[styles.chip, { backgroundColor: colors.fill }]} accessibilityRole="button" accessibilityLabel={`${tag}, ${n} bài`}>
                      <Text style={[type.subhead, { color: colors.text }]}>{tag}</Text>
                      <Text style={[type.caption, { color: colors.textSecondary }]}>{n}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>

            {categories.length > 0 && (
              <View style={styles.section}>
                <Text style={[type.title3, { color: colors.text, marginBottom: space.md }]}>Duyệt theo danh mục</Text>
                <View style={styles.grid}>
                  {categories.map(([cat, n]) => (
                    <GradientTile
                      key={cat}
                      icon="albums-outline"
                      title={cat}
                      subtitle={`${n} bài`}
                      colors={gradientFor(cat)}
                      width={tileWidth}
                      height={isMobile ? 88 : 100}
                      onPress={() => setGroup({ kind: 'category', key: cat })}
                    />
                  ))}
                </View>
              </View>
            )}

            {countries.length > 0 && (
              <View style={styles.section}>
                <Text style={[type.title3, { color: colors.text, marginBottom: space.md }]}>Duyệt theo quốc gia</Text>
                <View style={styles.grid}>
                  {countries.map(([country, n]) => (
                    <GradientTile
                      key={country}
                      icon="globe-outline"
                      title={country}
                      subtitle={`${n} bài`}
                      colors={gradientFor(country)}
                      width={tileWidth}
                      height={isMobile ? 88 : 100}
                      onPress={() => setGroup({ kind: 'country', key: country })}
                    />
                  ))}
                </View>
              </View>
            )}
          </>
        )}
      </ChromeScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  searchBar: { paddingHorizontal: GUTTER, paddingBottom: space.sm },
  section: { paddingHorizontal: GUTTER, marginTop: space.xl },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.md, minHeight: 36, borderRadius: radius.pill },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  actions: { flexDirection: 'row', gap: space.sm, marginVertical: space.md },
  action: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, borderRadius: radius.md },
  topCard: { flexDirection: 'row', alignItems: 'center', gap: space.lg, padding: space.lg, borderRadius: radius.xl },
  playFab: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: GUTTER },
  back: { flexDirection: 'row', alignItems: 'center', marginBottom: space.sm, alignSelf: 'flex-start', minHeight: 44 },
});
