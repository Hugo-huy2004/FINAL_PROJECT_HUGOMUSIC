import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import ChromeScrollView from '../../ui/ChromeScrollView';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useStore } from '../../store/useStore';
import { useAppTheme } from '../../ui/theme';
import { useTranslation } from '../../i18n/i18n';
import { useIsMobile, ContentWidthContext } from '../../lib/responsive';
import { LibrarySection, LIBRARY_SECTIONS } from '../../lib/tabRouting';
import { LargeTitle, AccountButton, ListRow, MediaTile, BackButton, GlassCapsule, CapsuleButton, SwipeBack } from '../../ui/kit';
import { type, space, GUTTER } from '../../ui/tokens';
import PlaylistsTab, { requestNewPlaylist } from './PlaylistsTab';
import ArtistsTab from './ArtistsTab';
import AlbumsTab from './AlbumsTab';
import SongsTab from './SongsTab';
import MadeForYouTab from './MadeForYouTab';
import DownloadedTab from './DownloadedTab';
import RoomsTab from '../Rooms/RoomsTab';
import { Icon } from 'hugo-music';

// Apple Music style library (iOS 26): large header + glass [create playlist | edit item] +
// avatar; avatar; a list item with "›"; Below is "Recent Heart Drops". Click an item to go to the page
// of that section — every page opens with an ever-present PERSONALIZED section (My Playlist, art
// artist/album you like, listened to recently, my room...). Each page builds its own scrolling area and
// put `header` (back button + title) at the top, so long pages can use FlatList.
export type LibraryTabProps = { header: React.ReactNode; onNavigate: (tab: string) => void };

const SECTIONS: Record<LibrarySection, { label: string; icon: keyof typeof Icon.glyphMap; view: React.ComponentType<LibraryTabProps> }> = {
  playlists: { label: 'Danh sách phát', icon: 'list', view: PlaylistsTab },
  artists: { label: 'Nghệ sĩ', icon: 'mic-outline', view: ArtistsTab },
  albums: { label: 'Album', icon: 'albums-outline', view: AlbumsTab },
  'made-for-you': { label: 'Dành cho bạn', icon: 'person-circle-outline', view: MadeForYouTab },
  songs: { label: 'Bài hát', icon: 'musical-note', view: SongsTab },
  downloaded: { label: 'Đã tải về', icon: 'arrow-down-circle-outline', view: DownloadedTab },
  party: { label: 'Phòng nghe chung', icon: 'people-outline', view: RoomsTab },
};
const HIDDEN_KEY = 'hugo:libraryHidden';

export default function LibraryScreen({ section, onSection, onNavigate }: {
  section: LibrarySection | null; onSection: (s: LibrarySection | null) => void; onNavigate: (tab: string) => void;
}) {
  const { t } = useTranslation();

  if (section) {
    const Page = SECTIONS[section].view;
    const header = (
      <>
        <BackButton onPress={() => onSection(null)} label={t('library')} />
        <LargeTitle title={SECTIONS[section].label} />
      </>
    );
    return (
      <SwipeBack onBack={() => onSection(null)}>
        <Page key={section} header={header} onNavigate={onNavigate} />
      </SwipeBack>
    );
  }
  return <Root onSection={onSection} onNavigate={onNavigate} />;
}

function Root({ onSection, onNavigate }: { onSection: (s: LibrarySection) => void; onNavigate: (tab: string) => void }) {
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { width } = useWindowDimensions();
  const measured = React.useContext(ContentWidthContext);
  const user = useStore((s) => s.user);
  const setLoginModalVisible = useStore((s) => s.setLoginModalVisible);
  const likedSongs = useStore((s) => s.likedSongs);
  const playOrToggleSong = useStore((s) => s.playOrToggleSong);
  const currentSong = useStore((s) => s.currentSong);
  const isPlaying = useStore((s) => s.isPlaying);
  const [hidden, setHidden] = useState<LibrarySection[]>([]);
  const [editing, setEditing] = useState(false);

  // Which items appear on the Library page is chosen by the user (✓ button in the glass), like Apple Music.
  useEffect(() => {
    AsyncStorage.getItem(HIDDEN_KEY).then((v) => v && setHidden(JSON.parse(v))).catch(() => {});
  }, []);
  const toggleHidden = (id: LibrarySection) => {
    const next = hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id];
    setHidden(next);
    AsyncStorage.setItem(HIDDEN_KEY, JSON.stringify(next)).catch(() => {});
  };

  const rows = editing ? LIBRARY_SECTIONS : LIBRARY_SECTIONS.filter((id) => !hidden.includes(id));
  const recentLiked = useMemo(() => likedSongs.slice(0, isMobile ? 6 : 12), [likedSongs, isMobile]);
  const inner = (measured ?? width) - GUTTER * 2;
  const columns = isMobile ? 2 : Math.max(3, Math.floor((inner + space.md) / (190 + space.md)));
  const tile = Math.floor((inner - space.md * (columns - 1)) / columns);

  const actions = (
    <View style={styles.headRight}>
      <GlassCapsule>
        <CapsuleButton
          icon="add"
          iconSize={24}
          width={44}
          color={colors.text}
          label="Danh sách phát mới"
          onPress={() => {
            if (!user) return setLoginModalVisible(true);
            requestNewPlaylist();
            onSection('playlists');
          }}
        />
        <CapsuleButton
          icon={editing ? 'checkmark' : 'options-outline'}
          iconSize={22}
          width={44}
          color={editing ? colors.accent : colors.text}
          label={editing ? 'Xong' : 'Chọn mục hiển thị'}
          onPress={() => setEditing((e) => !e)}
        />
      </GlassCapsule>
      <AccountButton onNavigate={onNavigate} />
    </View>
  );

  return (
    <ChromeScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 200 }} showsVerticalScrollIndicator={false}>
      <LargeTitle title={t('library')} right={actions} />
      <View style={styles.pad}>
        {editing && <Text style={[type.footnote, { color: colors.textSecondary, marginBottom: space.xs }]}>Chọn các mục hiện trên trang Thư viện.</Text>}
        {rows.map((id, i) => {
          const off = hidden.includes(id);
          return (
            <ListRow
              key={id}
              icon={SECTIONS[id].icon}
              title={SECTIONS[id].label}
              separator={i < rows.length - 1}
              onPress={() => (editing ? toggleHidden(id) : onSection(id))}
              right={
                editing
                  ? <Icon name={off ? 'ellipse-outline' : 'checkmark-circle'} size={22} color={off ? colors.textTertiary : colors.accent} />
                  : <Icon name="chevron-forward" size={18} color={colors.textTertiary} />
              }
            />
          );
        })}
      </View>

      {!editing && recentLiked.length > 0 && (
        <View style={[styles.pad, { marginTop: space.xxl }]}>
          <Text style={[type.title2, { color: colors.text, marginBottom: space.md }]}>Thả tim gần đây</Text>
          <View style={styles.grid}>
            {recentLiked.map((s) => (
              <MediaTile key={s._id} uri={s.coverArt} title={s.title} subtitle={s.artist} size={tile} active={currentSong?._id === s._id} playing={isPlaying} onPress={() => playOrToggleSong(s, likedSongs)} />
            ))}
          </View>
        </View>
      )}
    </ChromeScrollView>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: GUTTER },
  back: { flexDirection: 'row', alignItems: 'center', minHeight: 44, alignSelf: 'flex-start', paddingHorizontal: GUTTER - 6, marginTop: space.xs },
  headRight: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, rowGap: space.lg },
});
