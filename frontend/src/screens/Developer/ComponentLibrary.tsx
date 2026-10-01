import { ReactNode, useEffect, useMemo, useState } from 'react';
import { View, Text, Platform } from 'react-native';
import { useAppTheme } from '../../theme/theme';
import { useStore } from '../../store/useStore';
import { space, radius, type, gradientFor } from '../../ui/tokens';
import {
  LargeTitle, MediaTile, GradientTile, ListRow, SearchField, SongRow, SectionHeader, BackButton, PinnedRow, GlassButton, CapsuleButton, GlassArt,
} from '../../ui/kit';
import LiquidGlassButton from '../../components/LiquidGlass/LiquidGlassButton';
import CoverArt from '../../components/CoverArt';
import SeekBar from '../../components/Player/SeekBar';
import AppTextField from '../../ui/native/AppTextField';
import AppToggle from '../../ui/native/AppToggle';
import { C, Card, Badge, Btn, Stat, Chips, Segmented, Bars, Empty, SearchBar, s as ui } from '../Admin/ui';

type Prop = [name: string, type: string, def: string, desc: string];
type Entry = { id: string; group: string; name: string; from: string; what: string; when: string; props: Prop[]; code: string; demo: () => ReactNode };

const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, SFMono-Regular, Menlo, monospace' });

// Thư viện giao diện của Hugo Music: mỗi mục là component THẬT đang dùng trong ứng dụng (không phải ảnh chụp),
// kèm props, đoạn code mẫu và khi nào nên dùng. Thêm component mới vào ui/kit → thêm một mục vào ENTRIES.
export default function ComponentLibrary() {
  const [group, setGroup] = useState('Tất cả');
  const [q, setQ] = useState('');
  const entries = useEntries();
  const groups = ['Tất cả', ...new Set(entries.map((e) => e.group))];
  const shown = entries.filter((e) => (group === 'Tất cả' || e.group === group)
    && (!q || `${e.name} ${e.what}`.toLowerCase().includes(q.toLowerCase())));

  return (
    <View>
      <Guide />
      <View style={ui.toolbar}><SearchBar value={q} onChange={setQ} placeholder="Tìm component…" /></View>
      <View style={{ marginBottom: 16 }}>
        <Chips value={group} onChange={setGroup} options={groups.map((g) => ({ key: g, label: g, count: g === 'Tất cả' ? entries.length : entries.filter((e) => e.group === g).length }))} />
      </View>
      {shown.map((e) => <EntryCard key={e.id} e={e} />)}
      {!shown.length && <Card><Empty icon="search-outline" title="Không có component nào khớp" /></Card>}
    </View>
  );
}

function Guide() {
  const rules: [string, string][] = [
    ['Import từ một chỗ', "Màn hình người nghe dựng từ `src/ui/kit` (import { MediaTile, ListRow } from '../../ui/kit'); trang quản trị dùng `src/screens/Admin/ui`. Không tự vẽ lại nút/thẻ trong từng màn."],
    ['Không viết số trần', 'Khoảng cách, bo góc, cỡ chữ lấy từ `src/ui/tokens` (space, radius, type). Màu lấy từ theme: const { colors } = useAppTheme() — tự đổi theo Sáng/Tối.'],
    ['Trợ năng là bắt buộc', 'Nút chỉ có biểu tượng phải có `label`/`a11y` (trình đọc màn hình đọc to). Vùng chạm tối thiểu 44 pt (TOUCH). Chữ trên nền màu đạt tương phản 4.5:1.'],
    ['Một nền tảng, ba nơi chạy', 'Cùng mã chạy iOS, Android, web. Khác biệt theo nền tảng nằm trong tệp .ios.tsx / .web.tsx (Metro tự chọn) — màn hình không rẽ nhánh Platform.OS.'],
    ['Liquid Glass có chừng mực', 'Kính (GlassButton, Droplet) cho điều khiển nổi trên nội dung; danh sách và chữ đọc dài đặt trên nền đặc để dễ đọc.'],
  ];
  return (
    <Card title="Hướng dẫn sử dụng" subtitle="Năm quy tắc để màn mới trông và hoạt động như phần còn lại của Hugo Music">
      {rules.map(([t, d], i) => (
        <View key={t} style={{ flexDirection: 'row', gap: 12, marginBottom: i < rules.length - 1 ? 14 : 0 }}>
          <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: C.accentBg, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: C.accent, fontWeight: '800', fontSize: 12 }}>{i + 1}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={ui.rowTitle}>{t}</Text>
            <Text style={[ui.rowSub, { lineHeight: 19 }]}>{d}</Text>
          </View>
        </View>
      ))}
    </Card>
  );
}

function EntryCard({ e }: { e: Entry }) {
  const [tab, setTab] = useState('demo');
  const { colors } = useAppTheme();
  return (
    <Card title={e.name} subtitle={e.what} right={<Badge label={e.group} tone="gray" />}>
      <Text style={[ui.rowSub, { marginBottom: 12 }]}><Text style={{ fontWeight: '700', color: C.text }}>Khi nào dùng: </Text>{e.when}</Text>
      <Segmented value={tab} onChange={setTab} options={[{ key: 'demo', label: 'Ví dụ' }, { key: 'props', label: `Props (${e.props.length})` }, { key: 'code', label: 'Code' }]} />
      {tab === 'demo' && (
        <View style={{ backgroundColor: colors.background, borderRadius: 12, padding: 20, borderWidth: 1, borderColor: C.border, gap: 12 }}>{e.demo()}</View>
      )}
      {tab === 'props' && (
        <View style={{ borderWidth: 1, borderColor: C.border, borderRadius: 12, overflow: 'hidden' }}>
          {e.props.map(([n, t, d, desc], i) => (
            <View key={n} style={[ui.row, i === 0 && { borderTopWidth: 0 }, { alignItems: 'flex-start' }]}>
              <View style={{ width: 150 }}>
                <Text style={{ fontFamily: mono, fontSize: 13, fontWeight: '700', color: C.text }}>{n}</Text>
                {!!d && <Text style={{ fontFamily: mono, fontSize: 12, color: C.faint }}>= {d}</Text>}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: mono, fontSize: 12, color: C.violet }}>{t}</Text>
                <Text style={ui.rowSub}>{desc}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
      {tab === 'code' && (
        <View style={{ backgroundColor: '#0F172A', borderRadius: 12, padding: 16 }}>
          <Text selectable style={{ fontFamily: mono, fontSize: 13, color: '#E2E8F0', lineHeight: 20 }}>{`import { ${e.name.split(' ')[0]} } from '${e.from}';\n\n${e.code}`}</Text>
        </View>
      )}
    </Card>
  );
}

function Swatch({ name, color }: { name: string; color: string }) {
  return (
    <View style={{ width: 120 }}>
      <View style={{ height: 44, borderRadius: 10, backgroundColor: color, borderWidth: 1, borderColor: C.border }} />
      <Text style={{ fontSize: 12, fontWeight: '600', color: C.text, marginTop: 4 }}>{name}</Text>
      <Text style={{ fontFamily: mono, fontSize: 11, color: C.faint }}>{color}</Text>
    </View>
  );
}

function useEntries(): Entry[] {
  const { colors } = useAppTheme();
  const songs = useStore((st) => st.songs);
  const fetchSongs = useStore((st) => st.fetchSongs);
  // Trang này nằm ngoài khung ứng dụng (nơi thường tải kho) — tự tải để ví dụ dùng bài thật.
  useEffect(() => { if (!songs.length) fetchSongs(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [toggle, setToggle] = useState(true);
  const [text, setText] = useState('');
  const [progress, setProgress] = useState(0.35);
  const [seg, setSeg] = useState('a');
  const sample = songs.slice(0, 3);
  const noop = () => {};

  return useMemo<Entry[]>(() => [
    {
      id: 'tokens', group: 'Nền tảng', name: 'tokens', from: '../../ui/tokens', what: 'Khoảng cách, bo góc, cỡ chữ, màu theme',
      when: 'Mọi kích thước và màu trong giao diện — thay cho số trần.',
      props: [
        ['space', '{ xxs…xxxl }', '', '2 · 4 · 8 · 12 · 16 · 20 · 24 · 32'],
        ['radius', '{ sm…xxl, pill }', '', '6 · 10 · 14 · 20 · 28 · 999'],
        ['type', '{ largeTitle…caption }', '', 'Thang chữ theo Apple HIG (34 → 12 pt)'],
        ['gradientFor(key)', '(string) => [string, string]', '', 'Cặp màu ổn định theo khoá — ảnh bìa tự tạo'],
      ],
      code: "const { colors } = useAppTheme();\n<View style={{ padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.surface }}>\n  <Text style={[type.headline, { color: colors.text }]}>Tiêu đề</Text>\n</View>",
      demo: () => (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {(['background', 'surface', 'text', 'textSecondary', 'accent', 'border', 'fill'] as const).map((k) => <Swatch key={k} name={k} color={String(colors[k])} />)}
          </View>
          <View style={{ gap: 4 }}>
            {(['largeTitle', 'title2', 'headline', 'body', 'footnote', 'caption'] as const).map((k) => (
              <Text key={k} style={[type[k], { color: colors.text }]}>{k} · {type[k].fontSize} pt</Text>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
            {Object.entries(space).map(([k, v]) => <View key={k} style={{ width: v, height: v, backgroundColor: colors.accent, borderRadius: 2 }} accessibilityLabel={`space.${k}`} />)}
          </View>
        </>
      ),
    },
    {
      id: 'liquid', group: 'Nút', name: 'LiquidGlassButton', from: '../../components/LiquidGlass/LiquidGlassButton', what: 'Nút hành động chính, hiệu ứng gợn nước khi bấm',
      when: 'Hành động chính của một màn/hộp thoại (Đăng nhập, Tiếp tục, Tải lên). Mỗi màn tối đa một nút primary.',
      props: [
        ['title', 'string', '', 'Chữ trên nút'], ['onPress', '() => void', '', 'Xử lý khi bấm'],
        ['variant', "'primary' | 'glass'", "'primary'", 'Màu thương hiệu hoặc kính'], ['size', "'md' | 'lg'", "'md'", 'Cỡ nút'],
        ['icon', 'ReactNode', '', 'Biểu tượng/ActivityIndicator thay chữ khi đang tải'], ['disabled', 'boolean', 'false', 'Khoá nút'],
      ],
      code: '<LiquidGlassButton variant="primary" size="lg" title="Đăng nhập" onPress={submit} disabled={!ready} />',
      demo: () => (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          <LiquidGlassButton title="Primary" onPress={noop} />
          <LiquidGlassButton title="Primary lg" size="lg" onPress={noop} />
          <LiquidGlassButton title="Glass" variant="glass" onPress={noop} />
          <LiquidGlassButton title="Disabled" onPress={noop} disabled />
        </View>
      ),
    },
    {
      id: 'glassbtn', group: 'Nút', name: 'GlassButton', from: '../../ui/kit', what: 'Nút tròn bằng kính chỉ có biểu tượng',
      when: 'Điều khiển nổi trên ảnh/nội dung: đóng, quay lại, thêm, menu. Luôn đặt `label`.',
      props: [
        ['icon', 'Ionicons name', '', 'Tên biểu tượng'], ['label', 'string', '', 'Nhãn cho trình đọc màn hình (bắt buộc)'],
        ['onPress', '() => void', '', ''], ['size', 'number', '44', 'Đường kính (≥ 44 để dễ chạm)'], ['iconSize', 'number', '21', ''],
      ],
      code: '<GlassButton icon="close" label="Đóng" onPress={onClose} />',
      demo: () => (
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <GlassButton icon="close" label="Đóng" onPress={noop} />
          <GlassButton icon="chevron-back" label="Quay lại" onPress={noop} />
          <GlassButton icon="ellipsis-horizontal" label="Thêm" onPress={noop} />
          <CapsuleButton icon="shuffle" label="Trộn bài" color={colors.accent} onPress={noop} />
        </View>
      ),
    },
    {
      id: 'back', group: 'Nút', name: 'BackButton', from: '../../ui/kit', what: 'Nút quay lại kèm tên màn trước',
      when: 'Đầu màn con (trang album, danh sách phát) — kiểu "‹ Thư viện" của iOS.',
      props: [['onPress', '() => void', '', ''], ['label', 'string', '', 'Tên màn quay về'], ['tone', "'light' | 'dark'", '', 'Trên ảnh sáng/tối']],
      code: '<BackButton label="Thư viện" onPress={goBack} />',
      demo: () => <BackButton label="Thư viện" onPress={noop} />,
    },
    {
      id: 'cover', group: 'Ảnh & thẻ', name: 'CoverArt', from: '../../components/CoverArt', what: 'Ảnh bìa bài hát, tự tạo ảnh kính khi thiếu ảnh',
      when: 'Mọi chỗ hiện ảnh bài/album. Tự lấy ảnh qua CDN, lỗi thì dựng ảnh bìa theo tên — không bao giờ ô trống.',
      props: [['uri', 'string', '', 'URL ảnh (R2 → tự đổi sang CDN)'], ['title', 'string', '', 'Dùng để tạo ảnh khi thiếu'], ['size', 'number', '', 'Cạnh (pt)'], ['radius', 'number', '6', 'Bo góc'], ['fallbackUri', 'string', '', 'Ảnh dự phòng']],
      code: '<CoverArt uri={song.coverArt} title={song.title} size={48} radius={8} />',
      demo: () => (
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {sample.map((x) => <CoverArt key={x._id} uri={x.coverArt} title={x.title} size={72} radius={10} />)}
          <CoverArt title="Không có ảnh" size={72} radius={10} />
        </View>
      ),
    },
    {
      id: 'glassart', group: 'Ảnh & thẻ', name: 'GlassArt', from: '../../ui/kit', what: 'Ảnh bìa kính tự tạo theo tên (khi nguồn không có ảnh)',
      when: 'Ô ảnh cho danh sách phát, bài thiếu ảnh — CoverArt tự dùng khi cần.',
      props: [['width', 'number', '', ''], ['height', 'number', '', ''], ['radius', 'number', '', ''], ['children', 'ReactNode', '', 'Nội dung đặt lên kính']],
      code: '<GlassArt width={96} height={96} radius={14} />',
      demo: () => <GlassArt width={96} height={96} radius={14} />,
    },
    {
      id: 'mediatile', group: 'Ảnh & thẻ', name: 'MediaTile', from: '../../ui/kit', what: 'Ô ảnh + tên + phụ đề trên kệ cuộn ngang',
      when: 'Kệ bài/album/nghệ sĩ ở Trang chủ, Mới. `round` cho nghệ sĩ.',
      props: [['uri', 'string', '', 'Ảnh bìa'], ['title', 'string', '', ''], ['subtitle', 'string', '', ''], ['size', 'number', '', 'Cạnh ảnh'], ['round', 'boolean', 'false', 'Ảnh tròn (nghệ sĩ)'], ['badge', 'string', '', 'Nhãn góc (vd. LỜI)'], ['playing', 'boolean', 'false', 'Đang phát'], ['onPress', '() => void', '', '']],
      code: '<MediaTile uri={song.coverArt} title={song.title} subtitle={song.artist} size={150} onPress={() => play(song)} />',
      demo: () => (
        <View style={{ flexDirection: 'row', gap: 16 }}>
          {sample.slice(0, 2).map((x) => <MediaTile key={x._id} uri={x.coverArt} title={x.title} subtitle={x.artist} size={130} onPress={noop} />)}
          {sample[2] && <MediaTile uri={sample[2].coverArt} title={sample[2].artist} subtitle="Nghệ sĩ" size={130} round onPress={noop} />}
        </View>
      ),
    },
    {
      id: 'gradient', group: 'Ảnh & thẻ', name: 'GradientTile', from: '../../ui/kit', what: 'Thẻ màu chuyển sắc có tiêu đề (mix, thể loại, đài)',
      when: 'Nội dung không có ảnh riêng: mix tự tạo, thể loại, kênh 24/7.',
      props: [['title', 'string', '', ''], ['subtitle', 'string', '', ''], ['colors', '[string, string]', '', 'Dùng gradientFor(key)'], ['icon', 'Ionicons name', '', ''], ['width', 'number', '', ''], ['height', 'number', '', ''], ['big', 'boolean', 'false', 'Chữ lớn'], ['onPress', '() => void', '', '']],
      code: "<GradientTile title=\"Chill Mix\" subtitle=\"Hugo Music\" colors={gradientFor('chill')} icon=\"shuffle\" width={220} height={260} big onPress={open} />",
      demo: () => (
        <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
          <GradientTile title="Chill Mix" subtitle="Hugo Music" colors={['#5E5CE6', '#BF5AF2']} icon="shuffle" width={180} height={200} big onPress={noop} />
          <GradientTile title="Điện tử" colors={['#FF375F', '#FF9F0A']} width={180} height={100} onPress={noop} />
          <GradientTile title={`gradientFor('Rock')`} colors={gradientFor('Rock')} width={180} height={100} onPress={noop} />
        </View>
      ),
    },
    {
      id: 'pinned', group: 'Danh sách', name: 'PinnedRow', from: '../../ui/kit', what: 'Dòng nổi bật có ô biểu tượng màu',
      when: 'Mục ghim đầu danh sách (Bài đã thích, Đã tải về, kênh đang nghe).',
      props: [['icon', 'Ionicons name', '', ''], ['colors', '[string, string]', '', ''], ['title', 'string', '', ''], ['subtitle', 'string', '', ''], ['onPress', '() => void', '', ''], ['right', 'ReactNode', '', '']],
      code: '<PinnedRow icon="heart" colors={["#FF375F", "#FF9F0A"]} title="Bài đã thích" subtitle="42 bài" onPress={open} />',
      demo: () => <PinnedRow icon="heart" colors={['#FF375F', '#FF9F0A']} title="Bài đã thích" subtitle="42 bài" onPress={noop} />,
    },
    {
      id: 'listrow', group: 'Danh sách', name: 'ListRow', from: '../../ui/kit', what: 'Dòng danh sách chuẩn: ảnh/biểu tượng, tiêu đề, phụ đề, phần phải',
      when: 'Mọi danh sách mục (Thư viện, Cài đặt, kết quả tìm kiếm).',
      props: [['title', 'string', '', ''], ['subtitle', 'string', '', ''], ['icon', 'Ionicons name', '', 'Khi không có ảnh'], ['art', 'string', '', 'URL ảnh'], ['round', 'boolean', 'false', ''], ['right', 'ReactNode', '', ''], ['active', 'boolean', 'false', 'Đang chọn/đang phát'], ['separator', 'boolean', 'true', 'Đường kẻ dưới'], ['onPress', '() => void', '', '']],
      code: '<ListRow icon="albums-outline" title="Album" subtitle="18 album" onPress={open} />',
      demo: () => (
        <View>
          <ListRow icon="albums-outline" title="Album" subtitle="18 album" onPress={noop} />
          <ListRow icon="people-outline" title="Nghệ sĩ" subtitle="640 nghệ sĩ" onPress={noop} separator={false} />
        </View>
      ),
    },
    {
      id: 'songrow', group: 'Danh sách', name: 'SongRow', from: '../../ui/kit', what: 'Một bài trong danh sách: ảnh, tên, nghệ sĩ, menu "…"; bấm để phát',
      when: 'Danh sách bài (album, danh sách phát, kết quả tìm). Dùng SongList cho cả mảng bài.',
      props: [['song', 'Song', '', ''], ['list', 'Song[]', '', 'Hàng chờ khi bấm phát'], ['subtitle', '(s) => string', 's.artist', ''], ['onPlay', '(s) => void', '', 'Thay hành vi phát mặc định'], ['onRemove', '(s) => void', '', 'Có → menu hiện "Xoá khỏi danh sách này"'], ['last', 'boolean', 'false', 'Bỏ đường kẻ cuối']],
      code: '<SongList songs={album.songs} />\n// hoặc từng dòng:\n<SongRow song={s} list={songs} onRemove={removeFromPlaylist} />',
      demo: () => <View>{sample.map((x, i) => <SongRow key={x._id} song={x} list={sample} last={i === sample.length - 1} />)}</View>,
    },
    {
      id: 'titles', group: 'Danh sách', name: 'LargeTitle', from: '../../ui/kit', what: 'Tiêu đề lớn đầu màn + SectionHeader cho từng kệ',
      when: 'Đầu mỗi tab (Trang chủ, Mới…) và đầu mỗi kệ nội dung ("Xem tất cả").',
      props: [['title', 'string', '', ''], ['subtitle', 'string', '', ''], ['right', 'ReactNode', '', 'Nút bên phải (vd. ảnh đại diện)']],
      code: '<LargeTitle title="Trang chủ" />\n<SectionHeader title="Mới phát hành" onSeeAll={openAll} />',
      demo: () => <><LargeTitle title="Trang chủ" subtitle="Dành cho bạn" /><SectionHeader title="Mới phát hành" onSeeAll={noop} /></>,
    },
    {
      id: 'search', group: 'Nhập liệu', name: 'SearchField', from: '../../ui/kit', what: 'Ô tìm kiếm bo tròn có biểu tượng',
      when: 'Tìm trong một danh sách/kho (tab Tìm kiếm, Thư viện).',
      props: [['value', 'string', '', ''], ['onChangeText', '(t) => void', '', ''], ['placeholder', 'string', '', ''], ['autoFocus', 'boolean', 'false', '']],
      code: '<SearchField value={q} onChangeText={setQ} placeholder="Bài hát, nghệ sĩ, album" />',
      demo: () => <SearchField value={text} onChangeText={setText} placeholder="Bài hát, nghệ sĩ, album" />,
    },
    {
      id: 'textfield', group: 'Nhập liệu', name: 'AppTextField', from: '../../ui/native/AppTextField', what: 'Ô nhập chữ dùng ô nhập GỐC của từng nền tảng (tự điền mật khẩu, mã OTP)',
      when: 'Form (đăng nhập, đăng ký, hồ sơ). Đặt textContentType đúng để iOS/Android gợi ý tự điền.',
      props: [['value', 'string', '', ''], ['onChangeText', '(t) => void', '', ''], ['placeholder', 'string', '', ''], ['secureTextEntry', 'boolean', 'false', 'Mật khẩu'], ['keyboardType', "'default' | 'email-address' | 'number-pad' | 'phone-pad'", "'default'", ''], ['textContentType', 'string', '', 'username | password | newPassword | oneTimeCode…'], ['onSubmitEditing', '() => void', '', 'Phím Return']],
      code: '<AppTextField value={email} onChangeText={setEmail} placeholder="Email" keyboardType="email-address" textContentType="emailAddress" />',
      demo: () => <AppTextField value={text} onChangeText={setText} placeholder="Email" style={{ height: 44, borderRadius: radius.md, paddingHorizontal: space.md, backgroundColor: colors.inputBg, color: colors.text }} />,
    },
    {
      id: 'toggle', group: 'Nhập liệu', name: 'AppToggle', from: '../../ui/native/AppToggle', what: 'Công tắc bật/tắt gốc của nền tảng',
      when: 'Cài đặt bật/tắt tức thì (Sound Check, đồng bộ thiết bị).',
      props: [['value', 'boolean', '', ''], ['onValueChange', '(v) => void', '', ''], ['accessibilityLabel', 'string', '', 'Bắt buộc']],
      code: '<AppToggle value={soundCheck} onValueChange={setSoundCheck} accessibilityLabel="Sound Check" />',
      demo: () => <AppToggle value={toggle} onValueChange={setToggle} accessibilityLabel="Ví dụ công tắc" />,
    },
    {
      id: 'seek', group: 'Phát nhạc', name: 'SeekBar', from: '../../components/Player/SeekBar', what: 'Thanh kéo tiến độ/âm lượng (chạm hoặc kéo, tỉ lệ 0–1)',
      when: 'Tiến độ bài, âm lượng. Luôn có `label` cho trình đọc màn hình.',
      props: [['progress', 'number', '', '0 – 1'], ['onSeek', '(ratio) => void', '', ''], ['trackColor', 'string', '', ''], ['fillColor', 'string', '', ''], ['label', 'string', '', 'Bắt buộc'], ['thickness', 'number', '4', ''], ['disabled', 'boolean', 'false', 'Radio trực tiếp không tua được']],
      code: '<SeekBar progress={position / duration} onSeek={(r) => seek(r * duration)} trackColor={colors.fill} fillColor={colors.accent} label="Tiến độ bài" />',
      demo: () => (
        <>
          <SeekBar progress={progress} onSeek={setProgress} trackColor={colors.fill} fillColor={colors.accent} label="Tiến độ ví dụ" />
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{Math.round(progress * 100)}% — kéo hoặc chạm vào thanh</Text>
        </>
      ),
    },
    {
      id: 'admin', group: 'Quản trị', name: 'Btn · Badge · Stat · Chips · Segmented · Card · Bars · Empty', from: '../Admin/ui', what: 'Bộ giao diện của trang quản trị (bảng dữ liệu, số liệu, bộ lọc)',
      when: 'Chỉ trong trang quản trị/công cụ nội bộ — nền sáng, mật độ thông tin cao, không dùng kính.',
      props: [
        ['Btn', "variant: 'primary' | 'secondary' | 'danger' | 'ghost'", "'secondary'", 'Có label hoặc a11y (nút chỉ biểu tượng)'],
        ['Badge', "tone: 'green' | 'red' | 'amber' | 'blue' | 'violet' | 'gray'", "'gray'", 'Trạng thái ngắn'],
        ['Stat', '{ icon, label, value, hint?, tone?, onPress? }', '', 'Thẻ số liệu; bấm để đi tới danh sách đã lọc'],
        ['Chips / Segmented', '{ options, value, onChange }', '', 'Bộ lọc / chuyển chế độ xem'],
        ['useLoader', '(load, deps, debounceMs?)', '', 'Tải dữ liệu + trạng thái lỗi/đang tải + tải lại'],
      ],
      code: '<Stat icon="time-outline" tone="amber" label="Bài chờ duyệt" value={12} onPress={openQueue} />\n<Btn variant="primary" icon="checkmark" label="Xuất bản" onPress={publish} />\n<Badge label="Đã xuất bản" tone="green" />',
      demo: () => (
        <>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Btn variant="primary" icon="checkmark" label="Xuất bản" onPress={noop} />
            <Btn icon="create-outline" label="Sửa" onPress={noop} />
            <Btn variant="danger" icon="trash-outline" label="Xoá" onPress={noop} />
            <Btn variant="ghost" icon="close" a11y="Đóng" onPress={noop} />
          </View>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            {(['green', 'red', 'amber', 'blue', 'violet', 'gray'] as const).map((t) => <Badge key={t} label={t} tone={t} />)}
          </View>
          <View style={ui.grid}>
            <Stat icon="time-outline" tone="amber" label="Bài chờ duyệt" value={12} />
            <Stat icon="play-circle-outline" tone="green" label="Lượt nghe" value={1284} hint="+12% tuần này" />
          </View>
          <Segmented value={seg} onChange={setSeg} options={[{ key: 'a', label: 'Nghệ sĩ' }, { key: 'b', label: 'Album' }]} />
          <Bars height={60} data={[3, 5, 2, 8, 6, 9, 4].map((v, i) => ({ label: `N${i + 1}`, value: v }))} />
        </>
      ),
    },
  ], [colors, sample, toggle, text, progress, seg]);
}
