import { useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import ChromeScrollView from '../../ui/ChromeScrollView';
import { useNavigation } from '@react-navigation/native';
import { useStore } from '../../store/useStore';
import { useAppTheme } from '../../theme/theme';
import { joinStation, joinBlindRoom } from '../../rooms/useRooms';
import { PinnedRow, ListRow, GradientTile } from '../../ui/kit';
import { type, space, GUTTER } from '../../ui/tokens';
import { useRoomLists } from './useRoomLists';
import type { LibraryTabProps } from '../Library/LibraryScreen';

// Thư viện › Phòng nghe chung. Mọi phòng do Hugo Music cung cấp (kênh 24/7 + phòng nghe mù),
// admin tạo/sửa ở trang Quản trị › Phòng nghe. Mục cá nhân hoá ghim đầu: phòng bạn đang ở,
// chưa ở phòng nào thì gợi ý kênh đông người nghe nhất lúc này.
export default function RoomsTab({ header }: LibraryTabProps) {
  const { colors } = useAppTheme();
  const navigation = useNavigation<any>();
  const user = useStore((s) => s.user);
  const liveRoom = useStore((s) => s.liveRoom);
  const setLoginModalVisible = useStore((s) => s.setLoginModalVisible);
  const { stations, blindRooms, loading, error } = useRoomLists();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const enter = async (id: string, fn: () => Promise<unknown>) => {
    if (!user) return setLoginModalVisible(true);
    setBusyId(id);
    setActionError(null);
    try {
      await fn();
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setBusyId(null);
    }
  };
  const openStation = (id: string, name: string) => enter(id, () => joinStation(id, name));
  const openBlind = (id: string, name: string) => enter(id, () => joinBlindRoom(id, name));

  const busiest = [...stations].sort((a, b) => b.listenerCount - a.listenerCount)[0];
  const pinned = liveRoom
    // Đang ở trong phòng: viên "đang trong phòng" nổi (AppLayout) là lối quay lại, dòng này chỉ báo.
    ? { title: liveRoom.name, subtitle: liveRoom.kind === 'station' ? 'Bạn đang nghe kênh này' : 'Bạn đang ở phòng nghe mù', onPress: undefined }
    : busiest
      ? { title: busiest.name, subtitle: busiest.now ? `Đang phát ♪ ${busiest.now.title}` : busiest.tagline || 'Kênh 24/7', onPress: () => openStation(busiest.id, busiest.name) }
      : null;

  return (
    <ChromeScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 200 }} showsVerticalScrollIndicator={false}>
      {header}
      <View style={styles.pad}>
        <PinnedRow
          icon={liveRoom ? 'radio' : 'sparkles'}
          colors={['#34C759', '#30B0C7']}
          title={pinned ? pinned.title : 'Phòng nghe chung'}
          subtitle={pinned ? pinned.subtitle : 'Các kênh của Hugo Music phát liên tục 24/7.'}
          onPress={pinned?.onPress}
        />

        {(error || actionError) && <Text style={styles.error}>{actionError || error}</Text>}

        <Text style={[type.title3, styles.heading, { color: colors.text }]}>Kênh 24/7</Text>
        {loading ? <ActivityIndicator color={colors.accent} /> : (
          <View style={styles.grid}>
            {stations.map((st) => (
              <GradientTile
                key={st.id}
                icon={busyId === st.id ? 'hourglass-outline' : 'radio'}
                title={st.name}
                subtitle={st.now ? `♪ ${st.now.title}` : st.tagline}
                colors={st.colors}
                width="48%"
                height={132}
                label={`Nghe kênh ${st.name}`}
                onPress={() => openStation(st.id, st.name)}
              />
            ))}
          </View>
        )}

        <Text style={[type.title3, styles.heading, { color: colors.text }]}>Nghe mù</Text>
        {blindRooms.map((r, i) => (
          <ListRow
            key={r.id}
            icon="ear-outline"
            title={r.name}
            subtitle={[r.tagline, r.listenerCount ? `${r.listenerCount} người` : null].filter(Boolean).join(' · ')}
            separator={i < blindRooms.length - 1}
            onPress={() => openBlind(r.id, r.name)}
            right={busyId === r.id ? <ActivityIndicator color={colors.accent} /> : undefined}
          />
        ))}

        {user?.role === 'admin' && (
          <>
            <Text style={[type.title3, styles.heading, { color: colors.text }]}>Quản trị</Text>
            <ListRow icon="construct-outline" title="Quản lý phòng" subtitle="Tạo, sửa, ẩn kênh và phòng nghe mù" separator={false} onPress={() => navigation.navigate('Admin', { section: 'rooms' })} />
          </>
        )}
      </View>
    </ChromeScrollView>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: GUTTER },
  heading: { marginTop: space.xxl, marginBottom: space.sm },
  error: { color: '#FF453A', marginTop: space.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: space.md },
});
