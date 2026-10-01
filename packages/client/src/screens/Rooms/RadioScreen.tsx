import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import ChromeScrollView from '../../ui/ChromeScrollView';
import { useStore, RadioStation } from '../../store/useStore';
import { useAppTheme } from '../../ui/theme';
import { useIsMobile } from '../../lib/responsive';
import { joinStation } from '../../rooms/useRooms';
import { LargeTitle, Shelf, GradientTile, ListRow, AccountButton } from '../../ui/kit';
import { type, space, radius, GUTTER } from '../../ui/tokens';
import { useRoomLists } from './useRoomLists';
import { Spinner } from 'hugo-music';

// Radio tab: listen live.
// - Hugo 24/7 channel (apps/server/src/modules/rooms/stations.js): provided and managed by Hugo Music; whole channel
// listen at the same moment. The card carries the channel's color + slogan, the subline is the actual song being played.
// - Online radio: real third-party radio waves (apps/server/src/modules/radio/RadioStation.js).
// When entering the channel, the room opens as a sheet covering the screen (Rooms/LiveRoomSheet), do not change the content of this tab.
export default function RadioScreen({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const { colors } = useAppTheme();
  const isMobile = useIsMobile();
  const user = useStore((s) => s.user);
  const setLoginModalVisible = useStore((s) => s.setLoginModalVisible);
  const radioStations = useStore((s) => s.radioStations);
  const fetchRadioStations = useStore((s) => s.fetchRadioStations);
  const playLiveRadio = useStore((s) => s.playLiveRadio);
  const currentSong = useStore((s) => s.currentSong);
  const isPlaying = useStore((s) => s.isPlaying);
  const { stations, loading, error } = useRoomLists();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    fetchRadioStations();
  }, []);

  const busy = async (id: string, fn: () => Promise<unknown>) => {
    setBusyId(id);
    setJoinError(null);
    try {
      await fn();
    } catch (e: any) {
      setJoinError(e.message);
    } finally {
      setBusyId(null);
    }
  };
  const tile = isMobile ? 168 : 200;

  return (
    <ChromeScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 200 }} showsVerticalScrollIndicator={false}>
      <LargeTitle title="Radio" right={<AccountButton onNavigate={onNavigate} />} />
      {(error || joinError) && <Text style={[styles.error, styles.pad]}>{joinError || error}</Text>}

      <View style={[styles.pad, { marginTop: space.md }]}>
        <Text style={[type.title2, { color: colors.text }]}>Kênh Hugo 24/7</Text>
      </View>
      {loading ? (
        <Spinner color={colors.accent} style={{ marginTop: space.lg }} />
      ) : (
        <Shelf gap={space.md}>
          {stations.map((st) => (
            <GradientTile
              key={st.id}
              icon={busyId === st.id ? 'hourglass-outline' : 'radio'}
              title={st.name}
              subtitle={[st.now ? `♪ ${st.now.title} · ${st.now.artist}` : st.tagline, st.listenerCount ? `${st.listenerCount} đang nghe` : null].filter(Boolean).join(' · ')}
              colors={st.colors}
              width={tile}
              height={tile}
              label={`Nghe kênh ${st.name}`}
              onPress={() => (user ? busy(st.id, () => joinStation(st.id, st.name)) : setLoginModalVisible(true))}
            />
          ))}
        </Shelf>
      )}

      {radioStations.length > 0 && (
        <View style={[styles.pad, { marginTop: space.xxl }]}>
          <Text style={[type.title2, { color: colors.text }]}>Đài trực tuyến</Text>
          <View style={{ height: space.sm }} />
          {radioStations.map((rs: RadioStation, i) => {
            const live = currentSong?._id === `radio-${rs._id}` && isPlaying;
            return (
              <ListRow
                key={rs._id}
                art={rs.favicon || ''}
                title={rs.name}
                subtitle={[rs.country, rs.genre].filter(Boolean).join(' · ') || 'Radio'}
                active={live}
                separator={i < radioStations.length - 1}
                onPress={() => busy(rs._id, () => playLiveRadio(rs))}
                right={
                  busyId === rs._id ? <Spinner color={colors.accent} /> : (
                    <View style={[styles.pill, { backgroundColor: colors.fill }]}>
                      <Text style={[styles.pillText, { color: colors.accent }]}>{live ? 'Đang phát' : 'Nghe'}</Text>
                    </View>
                  )
                }
              />
            );
          })}
        </View>
      )}
    </ChromeScrollView>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: GUTTER },
  error: { color: '#FF453A', marginTop: space.md },
  pill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.pill },
  pillText: { fontWeight: '700' },
});
