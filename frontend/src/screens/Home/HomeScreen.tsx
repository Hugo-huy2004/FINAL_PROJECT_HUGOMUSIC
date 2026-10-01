import { useEffect, useState } from 'react';
import { useArtistPhoto } from '../../utils/artistPhoto';
import { ActivityIndicator, useWindowDimensions } from 'react-native';
import ChromeScrollView from '../../ui/ChromeScrollView';
import { useStore, Song } from '../../store/useStore';
import { useTranslation } from '../../i18n/i18n';
import { useIsMobile } from '../../utils/responsive';
import { api } from '../../utils/api';
import { joinStation } from '../../rooms/useRooms';
import { LargeTitle, Shelf, MediaTile, GradientTile, AccountButton } from '../../ui/kit';
import { space } from '../../ui/tokens';
import { useHomeSections, hasLyrics } from './useHomeSections';

// Trang chủ — phần CÁ NHÂN HOÁ: mix theo thể loại → đã nghe → đài 24/7 → hát theo lời →
// mới phát hành (xem đủ ở tab Mới) → nghệ sĩ → cổ điển.
import type { StationInfo } from '../../rooms/types';
const ROW = 12;

export default function HomeScreen({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { width } = useWindowDimensions();
  const user = useStore((s) => s.user);
  const setLoginModalVisible = useStore((s) => s.setLoginModalVisible);
  const playSong = useStore((s) => s.playSong);
  const playOrToggleSong = useStore((s) => s.playOrToggleSong);
  const currentSong = useStore((s) => s.currentSong);
  const isPlaying = useStore((s) => s.isPlaying);
  const isLoadingSongs = useStore((s) => s.isLoadingSongs);
  const { recentlyPlayed, newReleases, withLyrics, classicalPicks, artists, mixes } = useHomeSections(ROW);
  const artistPhoto = useArtistPhoto();
  const [stations, setStations] = useState<StationInfo[]>([]);

  useEffect(() => {
    api.getStations().then((r: { stations: StationInfo[] }) => setStations(r.stations)).catch(() => {});
  }, []);

  const mixWidth = isMobile ? Math.min(300, width * 0.72) : 250;
  const tile = isMobile ? Math.min(170, width * 0.4) : 180;

  const openStation = async (st: StationInfo) => {
    if (!user) return setLoginModalVisible(true);
    await joinStation(st.id, st.name).catch(() => {}); // phòng tự mở dạng sheet (LiveRoomSheet)
  };

  const songShelf = (title: string, list: Song[], onSeeAll?: () => void) =>
    list.length > 0 && (
      <Shelf title={title} onSeeAll={onSeeAll}>
        {list.map((song) => (
          <MediaTile
            key={song._id}
            uri={song.coverArt}
            title={song.title}
            subtitle={song.artist}
            size={tile}
            badge={hasLyrics(song) ? 'LỜI' : undefined}
            active={currentSong?._id === song._id}
            playing={isPlaying}
            onPress={() => playOrToggleSong(song, list)}
          />
        ))}
      </Shelf>
    );

  return (
    <ChromeScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 200 }} showsVerticalScrollIndicator={false}>
      <LargeTitle title={t('home')} right={<AccountButton onNavigate={onNavigate} />} />
      {isLoadingSongs && !mixes.length && <ActivityIndicator color="#1CD8A9" style={{ marginTop: space.xl }} />}

      {mixes.length > 0 && (
        <Shelf title="Dành cho bạn">
          {mixes.map((mix) => (
            <GradientTile
              key={mix.key}
              big
              icon="shuffle"
              title={mix.title}
              subtitle={mix.artists}
              colors={mix.colors}
              width={mixWidth}
              height={mixWidth * 1.15}
              label={`Phát ${mix.title}`}
              onPress={() => playSong(mix.songs[0], mix.songs)}
            />
          ))}
        </Shelf>
      )}

      {songShelf(t('recentlyPlayed'), recentlyPlayed)}

      {stations.length > 0 && (
        <Shelf title="Đài dành cho bạn" onSeeAll={() => onNavigate('radio')}>
          {stations.map((st) => (
            <GradientTile
              key={st.id}
              icon="radio"
              title={st.name}
              subtitle={st.now ? `♪ ${st.now.title}` : st.tagline || 'Kênh 24/7'}
              colors={st.colors}
              width={tile}
              height={tile}
              label={`Nghe đài ${st.name}`}
              onPress={() => openStation(st)}
            />
          ))}
        </Shelf>
      )}

      {songShelf('Hát theo lời', withLyrics)}
      {songShelf(t('newReleases'), newReleases, () => onNavigate('new'))}

      {artists.length > 0 && (
        <Shelf title={t('favoriteArtists')} onSeeAll={() => onNavigate('artists')} gap={16}>
          {artists.slice(0, ROW).map((a) => (
            <MediaTile key={a.artist} round uri={artistPhoto(a.artist)} title={a.artist} size={isMobile ? 104 : 140} onPress={() => onNavigate('artists')} />
          ))}
        </Shelf>
      )}

      {songShelf(t('classicalMasterworks'), classicalPicks)}
    </ChromeScrollView>
  );
}
