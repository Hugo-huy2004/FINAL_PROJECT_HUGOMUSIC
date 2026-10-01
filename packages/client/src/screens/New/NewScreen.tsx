import { useContext, useMemo, useState } from 'react';
import { View, ScrollView, useWindowDimensions } from 'react-native';
import ChromeScrollView from '../../ui/ChromeScrollView';
import { useStore } from '../../store/useStore';
import { useIsMobile, ContentWidthContext } from '../../lib/responsive';
import { byNewest, useTopSongs } from '../../lib/songOrder';
import { LargeTitle, Shelf, SectionHeader, MediaTile, AccountButton } from '../../ui/kit';
import { space, GUTTER } from '../../ui/tokens';
import { releasesByNewest, Collection } from '../Library/libraryData';
import { AlbumDetail } from '../Library/AlbumsTab';
import EditorialCard from './EditorialCard';
import SongColumns from './SongColumns';
import ChartArt from './ChartArt';
import ChartDetail from './ChartDetail';
import { SCOPE_CHARTS, useGenreCharts, Chart, chartTitle, findChart } from './charts';
import { Spinner } from 'hugo-music';

// New Tab follows Apple Music's "New" page layout, content is from Hugo Music:
// big editorial tag (new releases + weekly chart) → "Everyone's listening" (track grid by
// column, weekly ranking) → "New releases" (real releases, newest added first) → rankings tab
// → "New songs" → rankings by genre. Click on the album/chart tab to open the details page on the spot.
const FEATURED_RELEASES = 5;
const SHELF = 15;
const firstSentence = (t?: string) => t?.split(/(?<=[.!?])\s/)[0];

type Open = { kind: 'album'; key: string } | { kind: 'chart'; id: string } | null;

export default function NewScreen({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const isMobile = useIsMobile();
  const { width } = useWindowDimensions();
  const measured = useContext(ContentWidthContext);
  const songs = useStore((s) => s.songs);
  const isLoadingSongs = useStore((s) => s.isLoadingSongs);
  const { top: trending } = useTopSongs(7, 24);
  const [open, setOpen] = useState<Open>(null);
  const genreCharts = useGenreCharts();

  const releases = useMemo(() => releasesByNewest(songs), [songs]);
  const newSongs = useMemo(() => byNewest(songs.filter((s) => s.category !== 'Podcast')).slice(0, 24), [songs]);
  // Large card: new release with cover photo + real color (with description preferred), weekly chart card interspersed.
  const featured = useMemo(() => {
    const withArt = releases.filter((r) => r.color);
    return [...withArt.filter((r) => r.description), ...withArt.filter((r) => !r.description)].slice(0, FEATURED_RELEASES);
  }, [releases]);

  if (open?.kind === 'album') {
    const album = releases.find((r) => r.key === open.key);
    if (album) return <AlbumDetail album={album} onBack={() => setOpen(null)} />;
  }
  if (open?.kind === 'chart') {
    const chart = findChart(open.id, genreCharts);
    if (chart) return <ChartDetail chart={chart} onBack={() => setOpen(null)} />;
  }

  const inner = (measured ?? width) - GUTTER * 2;
  const cardWidth = isMobile ? inner : Math.min(560, Math.floor((inner - space.lg) / 2));
  const tile = isMobile ? Math.min(170, width * 0.42) : 190;
  const openAlbum = (c: Collection) => setOpen({ kind: 'album', key: c.key });
  const openChart = (c: Chart) => setOpen({ kind: 'chart', id: c.id });
  const week = SCOPE_CHARTS[0];

  const releaseCard = (r: Collection) => (
    <EditorialCard
      key={r.key}
      eyebrow={r.kind === 'ALBUM' ? 'Album mới' : r.kind === 'EP' ? 'EP mới' : 'Đĩa đơn mới'}
      title={r.title}
      subtitle={r.subtitle}
      caption={firstSentence(r.description)}
      cover={r.cover}
      color={r.color}
      width={cardWidth}
      onPress={() => openAlbum(r)}
    />
  );
  const chartShelf = (title: string, charts: Chart[]) => (
    <Shelf title={title}>
      {charts.map((c) => (
        <MediaTile key={c.id} art={<ChartArt chart={c} size={tile} />} title={chartTitle(c)} subtitle="Hugo Music" size={tile} onPress={() => openChart(c)} />
      ))}
    </Shelf>
  );

  return (
    <ChromeScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 200 }} showsVerticalScrollIndicator={false}>
      <LargeTitle title="Mới" right={<AccountButton onNavigate={onNavigate} />} />
      {isLoadingSongs && !songs.length && <Spinner style={{ marginTop: space.xl }} />}

      {featured.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={cardWidth + space.lg}
          decelerationRate="fast"
          contentContainerStyle={{ paddingHorizontal: GUTTER, gap: space.lg }}
        >
          {releaseCard(featured[0])}
          <EditorialCard
            eyebrow="Bảng xếp hạng"
            title={chartTitle(week)}
            subtitle="Hugo Music"
            caption="Những bài được nghe nhiều nhất tuần này, cập nhật liên tục."
            color={week.colors[0]}
            art={(h) => <ChartArt chart={week} size={h} radius={0} />}
            width={cardWidth}
            onPress={() => openChart(week)}
          />
          {featured.slice(1).map(releaseCard)}
        </ScrollView>
      )}

      {trending.length > 0 && (
        <View style={{ marginTop: space.xxl }}>
          <SectionHeader title="Mọi người đang nghe" onSeeAll={() => openChart(week)} />
          <SongColumns songs={trending.map((t) => t.song)} />
        </View>
      )}

      {releases.length > 0 && (
        <Shelf title="Mới phát hành" onSeeAll={() => onNavigate('albums')}>
          {releases.slice(0, SHELF).map((r) => (
            <MediaTile key={r.key} uri={r.cover} title={r.title} subtitle={r.subtitle} size={tile} onPress={() => openAlbum(r)} />
          ))}
        </Shelf>
      )}

      {chartShelf('Bảng xếp hạng', SCOPE_CHARTS)}

      {newSongs.length > 0 && (
        <View style={{ marginTop: space.xxl }}>
          <SectionHeader title="Bài hát mới" onSeeAll={() => onNavigate('songs')} />
          <SongColumns songs={newSongs} />
        </View>
      )}

      {chartShelf('Theo thể loại', genreCharts)}
    </ChromeScrollView>
  );
}

