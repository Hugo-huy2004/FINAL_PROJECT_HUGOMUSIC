import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Image, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAdminAuth } from './hooks/useAdminAuth';
import { C, Btn } from './ui';
import OverviewPanel from './panels/OverviewPanel';
import SongsPanel from './panels/SongsPanel';
import CatalogPanel from './panels/CatalogPanel';
import PublishingPanel from './panels/PublishingPanel';
import RoomsPanel from './panels/RoomsPanel';
import UsersPanel from './panels/UsersPanel';

export type AdminSection = 'overview' | 'songs' | 'catalog' | 'publishing' | 'rooms' | 'users';

const SECTIONS: { key: AdminSection; label: string; icon: keyof typeof Ionicons.glyphMap; desc: string }[] = [
  { key: 'overview', label: 'Tổng quan', icon: 'grid-outline', desc: 'Việc cần xử lý và tình hình nghe nhạc' },
  { key: 'songs', label: 'Nhạc', icon: 'musical-notes-outline', desc: 'Toàn bộ kho: tìm, lọc, sửa, duyệt hàng loạt, tải bài lên' },
  { key: 'catalog', label: 'Nghệ sĩ & album', icon: 'albums-outline', desc: 'Sửa tên, gộp nghệ sĩ trùng, ảnh, tiểu sử; thông tin album' },
  { key: 'publishing', label: 'Trạng thái đăng tải', icon: 'cloud-upload-outline', desc: 'Hàng chờ duyệt và chuỗi xử lý sau khi duyệt' },
  { key: 'rooms', label: 'Phòng nghe', icon: 'radio-outline', desc: 'Kênh 24/7, phòng nghe mù, chọn nhạc và điều khiển kênh' },
  { key: 'users', label: 'Người dùng', icon: 'people-outline', desc: 'Tài khoản, thói quen nghe, bảo vệ tài khoản' },
];

// Trang quản trị Hugo Music. Màn rộng: thanh điều hướng bên trái; điện thoại: các mục thành hàng cuộn ngang.
// Mục "Tổng quan" dẫn thẳng tới mục cần xử lý kèm bộ lọc (vd. bài đã xuất bản nhưng thiếu giấy phép).
export default function AdminDashboard({ initialSection = 'overview' }: { initialSection?: AdminSection }) {
  const { user, logout } = useAdminAuth();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wide = width >= 960;
  const [section, setSection] = useState<AdminSection>(SECTIONS.some((x) => x.key === initialSection) ? initialSection : 'overview');
  const [filter, setFilter] = useState<Record<string, string> | undefined>();
  const current = SECTIONS.find((x) => x.key === section)!;

  const go = (key: AdminSection, f?: Record<string, string>) => { setSection(key); setFilter(f); };
  const panelKey = `${section}:${JSON.stringify(filter || {})}`; // đổi bộ lọc từ Tổng quan → dựng lại mục với bộ lọc mới
  const panel = {
    overview: <OverviewPanel go={go} />,
    songs: <SongsPanel key={panelKey} initial={filter} />,
    catalog: <CatalogPanel />,
    publishing: <PublishingPanel key={panelKey} initial={filter} />,
    rooms: <RoomsPanel />,
    users: <UsersPanel key={panelKey} initial={filter} />,
  }[section];

  const nav = (
    <>
      {SECTIONS.map((x) => {
        const on = x.key === section;
        return (
          <Pressable
            key={x.key}
            onPress={() => go(x.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={({ pressed }) => [wide ? styles.navItem : styles.navPill, on && (wide ? styles.navItemOn : styles.navPillOn), pressed && { opacity: 0.8 }]}
          >
            <Ionicons name={x.icon} size={18} color={on ? C.accent : C.sub} />
            <Text style={[styles.navText, on && { color: C.accent }]}>{x.label}</Text>
          </Pressable>
        );
      })}
    </>
  );

  const account = (
    <View style={wide ? styles.account : styles.accountRow}>
      {wide && (
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.accountName} numberOfLines={1}>{user?.nickname || user?.username}</Text>
          <Text style={styles.accountRole}>Quản trị viên</Text>
        </View>
      )}
      <Btn small variant="ghost" icon="code-slash-outline" a11y="Tài liệu nhà phát triển" onPress={() => navigation.navigate('Developer')} />
      <Btn small variant="ghost" icon="home-outline" a11y="Về trang nghe nhạc" onPress={() => navigation.navigate('Home')} />
      <Btn small variant="danger" icon="log-out-outline" label={wide ? undefined : 'Đăng xuất'} a11y="Đăng xuất" onPress={logout} />
    </View>
  );

  const header = (
    <View style={styles.header}>
      <Text style={styles.title}>{current.label}</Text>
      <Text style={styles.desc}>{current.desc}</Text>
    </View>
  );

  if (wide) {
    return (
      <View style={[styles.root, { flexDirection: 'row' }]}>
        <View style={[styles.sidebar, { paddingTop: 24 + insets.top }]}>
          <View style={styles.brand}>
            <Image source={require('../../../assets/logo.png')} style={styles.logo} />
            <View>
              <Text style={styles.brandText}>Hugo Music</Text>
              <Text style={styles.brandSub}>Quản trị</Text>
            </View>
          </View>
          <View style={{ gap: 2, flex: 1 }}>{nav}</View>
          {account}
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.content, { paddingTop: 32 + insets.top }]}>
          {header}
          {panel}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={[styles.topbar, { paddingTop: 12 + insets.top }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 }}>
          <Image source={require('../../../assets/logo.png')} style={[styles.logo, { width: 28, height: 28 }]} />
          <Text style={[styles.brandText, { flex: 1 }]}>Quản trị</Text>
          {account}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 10 }}>
          {nav}
        </ScrollView>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.content, { paddingHorizontal: 16, paddingBottom: 32 + insets.bottom }]}>
        {header}
        {panel}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  sidebar: { width: 248, backgroundColor: C.surface, borderRightWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingBottom: 16 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, marginBottom: 24 },
  logo: { width: 34, height: 34, borderRadius: 9 },
  brandText: { fontSize: 16, fontWeight: '800', color: C.text },
  brandSub: { fontSize: 12, color: C.faint, fontWeight: '600' },
  navItem: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 40, paddingHorizontal: 12, borderRadius: 10 },
  navItemOn: { backgroundColor: C.accentBg },
  navPill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  navPillOn: { borderColor: C.accent, backgroundColor: C.accentBg },
  navText: { fontSize: 14, fontWeight: '600', color: C.sub },
  account: { flexDirection: 'row', alignItems: 'center', gap: 6, borderTopWidth: 1, borderColor: C.border, paddingTop: 12, paddingHorizontal: 4 },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  accountName: { fontSize: 14, fontWeight: '700', color: C.text },
  accountRole: { fontSize: 12, color: C.faint },
  topbar: { backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.border },
  content: { paddingHorizontal: 32, paddingBottom: 48, maxWidth: 1180, width: '100%', alignSelf: 'center' },
  header: { marginBottom: 20, marginTop: 16 },
  title: { fontSize: 28, fontWeight: '800', color: C.text, letterSpacing: -0.5 },
  desc: { fontSize: 14, color: C.sub, marginTop: 4 },
});
