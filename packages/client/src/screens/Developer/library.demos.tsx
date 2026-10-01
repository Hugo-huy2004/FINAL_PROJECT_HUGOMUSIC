import { useState, type ReactNode } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { ActionButton, Artwork, BackButton, Badge, BarChart, CapsuleButton, Card, Chips, EmptyState, ErrorText, FormField, Pager, Sheet, Spinner, StatCard, ContextMenu, DatePicker, Glass, GlassArt, GlassButton, GlassCapsule, GlassGroup, GlassTabBar, Gradient, gradientFor, GradientTile, HugoProvider, InsetGroup, LargeTitle, ListRow, MediaTile, NavigationSidebar, PinnedRow, SearchField, SectionHeader, SegmentedControl, Shelf, TextField, Toggle, useHugoTheme } from 'hugo-music';
import { useSampleSongs } from './useSampleSongs';
import { resolveImageUri } from '../../components/CoverArt';
import type { DemoMap } from './types';

// Live demos for the hugo-music library (packages/ui) — picked up by scripts/gen-component-docs.mjs.
// Glass only reads as glass with something behind it, so glass demos sit on a Stage of artwork and colour.
const noop = () => {};
const row = { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center' } as const;

function Stage({ children, height = 180 }: { children: ReactNode; height?: number }) {
  const [cover] = useSampleSongs(1);
  return (
    <View style={[styles.stage, { height }]}>
      <Gradient colors={['#FF375F', '#5E5CE6', '#0A84FF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      {cover?.coverArt ? <Image source={{ uri: resolveImageUri(cover.coverArt) }} style={[StyleSheet.absoluteFill, { opacity: 0.85 }]} /> : null}
      <View style={[StyleSheet.absoluteFill, styles.center]}>{children}</View>
    </View>
  );
}

const demos: DemoMap = {
  Glass: () => <GlassDemo />,
  GlassGroup: () => (
    <Stage height={120}>
      <GlassGroup spacing={10}>
        <GlassButton icon="play-skip-back" label="Previous" onPress={noop} />
        <GlassButton icon="play" label="Play" size={56} iconSize={26} tint="#11A37F" onPress={noop} />
        <GlassButton icon="play-skip-forward" label="Next" onPress={noop} />
      </GlassGroup>
    </Stage>
  ),
  GlassButton: () => (
    <Stage height={110}>
      <View style={row}>
        <GlassButton icon="close" label="Close" onPress={noop} />
        <GlassButton icon="chevron-back" label="Back" nudge={-2} onPress={noop} />
        <GlassButton icon="ellipsis-horizontal" label="More" variant="clear" onPress={noop} />
        <GlassButton icon="heart" label="Like" tint="#FF375F" onPress={noop} />
      </View>
    </Stage>
  ),
  CapsuleButton: () => (
    <Stage height={110}>
      <GlassCapsule>
        <CapsuleButton icon="shuffle" label="Shuffle" color="#fff" onPress={noop} />
        <CapsuleButton icon="repeat" label="Repeat" color="#fff" onPress={noop} />
        <CapsuleButton icon="share-outline" label="Share" color="#fff" onPress={noop} />
      </GlassCapsule>
    </Stage>
  ),
  ActionButton: () => (
    <Stage height={130}>
      <View style={row}>
        <ActionButton title="Continue" onPress={noop} />
        <ActionButton title="Sign in" size="lg" onPress={noop} />
        <ActionButton title="Cancel" variant="glass" onPress={noop} />
        <ActionButton title="Disabled" onPress={noop} disabled />
      </View>
    </Stage>
  ),
  SegmentedControl: () => {
    const [v, setV] = useState('songs');
    return <SegmentedControl value={v} onChange={setV} segments={[{ key: 'songs', label: 'Songs' }, { key: 'albums', label: 'Albums' }, { key: 'artists', label: 'Artists' }]} />;
  },
  Toggle: () => {
    const [on, setOn] = useState(true);
    return <Toggle value={on} onValueChange={setOn} accessibilityLabel="Example switch" />;
  },
  TextField: () => {
    const { colors } = useHugoTheme();
    const [v, setV] = useState('');
    return <TextField value={v} onChangeText={setV} placeholder="Email" keyboardType="email-address" textContentType="emailAddress"
      style={{ height: 44, borderRadius: 10, paddingHorizontal: 12, backgroundColor: colors.inputBg, color: colors.text }} />;
  },
  SearchField: () => {
    const [q, setQ] = useState('');
    return (
      <View style={{ gap: 12 }}>
        <SearchField value={q} onChangeText={setQ} placeholder="Songs, artists, albums" />
        <Stage height={100}><View style={{ width: '86%' }}><SearchField glass value={q} onChangeText={setQ} placeholder="Search in glass" /></View></Stage>
      </View>
    );
  },
  DatePicker: () => {
    const { colors } = useHugoTheme();
    const [d, setD] = useState('2000-06-15');
    return (
      <View style={{ gap: 8 }}>
        <DatePicker value={d} onChange={setD} />
        <Text style={{ color: colors.textSecondary }}>Value: {d}</Text>
      </View>
    );
  },
  ContextMenu: () => {
    const { colors } = useHugoTheme();
    const [last, setLast] = useState('—');
    return (
      <View>
        <ContextMenu items={[
          { key: 'play', label: 'Play', icon: 'play', onPress: () => setLast('Play') },
          { key: 'add', label: 'Add to playlist', icon: 'add-circle-outline', children: [{ key: 'a', label: 'Road trip', icon: 'list-outline', onPress: () => setLast('Road trip') }] },
          { key: 'remove', label: 'Remove', icon: 'trash-outline', destructive: true, onPress: () => setLast('Remove') },
        ]}>
          <ListRow icon="musical-note" title="Long-press this row" subtitle="Opens a glass context menu" onPress={noop} separator={false} />
        </ContextMenu>
        <Text style={{ color: colors.textSecondary }}>Last action: {last}</Text>
      </View>
    );
  },
  GlassTabBar: () => {
    const [tab, setTab] = useState('home');
    return (
      <Stage height={120}>
        <View style={{ width: '90%' }}>
          <GlassTabBar value={tab} onChange={setTab} items={[
            { key: 'home', label: 'Home', icon: 'home-outline', iconActive: 'home' },
            { key: 'new', label: 'New', icon: 'grid-outline', iconActive: 'grid' },
            { key: 'radio', label: 'Radio', icon: 'radio-outline', iconActive: 'radio' },
            { key: 'library', label: 'Library', icon: 'albums-outline', iconActive: 'albums' },
          ]} />
        </View>
      </Stage>
    );
  },
  NavigationSidebar: () => {
    const [sel, setSel] = useState('songs');
    return (
      <View style={{ height: 300, maxWidth: 280 }}>
        <NavigationSidebar selected={sel} onSelect={setSel} style={{ flex: 1 }} sections={[
          { items: [{ key: 'home', label: 'Home' }] },
          { title: 'Library', icon: 'albums-outline', items: [{ key: 'songs', label: 'Songs', trailing: '1,144' }, { key: 'albums', label: 'Albums', trailing: '86' }, { key: 'artists', label: 'Artists', trailing: '640' }] },
          { title: 'Playlists', icon: 'list-outline', items: [{ key: 'road', label: 'Road trip' }, { key: 'focus', label: 'Focus' }] },
        ]} />
      </View>
    );
  },
  BackButton: () => <Stage height={100}><BackButton label="Library" onPress={noop} style={{ marginLeft: 0, marginTop: 0 }} /></Stage>,
  LargeTitle: () => <LargeTitle title="Home" subtitle="For you" />,
  SectionHeader: () => <SectionHeader title="New releases" onSeeAll={noop} />,
  Shelf: () => {
    const sample = useSampleSongs(6);
    return <Shelf title="Recently played" onSeeAll={noop}>{sample.map((s) => <MediaTile key={s._id} uri={s.coverArt} title={s.title} subtitle={s.artist} size={120} onPress={noop} />)}</Shelf>;
  },
  ListRow: () => {
    const [s] = useSampleSongs(1);
    return (
      <View>
        <ListRow icon="albums-outline" title="Albums" subtitle="18 albums" chevron onPress={noop} />
        {s ? <ListRow art={s.coverArt} title={s.title} subtitle={s.artist} active onPress={noop} separator={false} /> : null}
      </View>
    );
  },
  InsetGroup: () => {
    const [on, setOn] = useState(true);
    return (
      <View style={{ marginTop: -24 }}>
        <InsetGroup header="Playback" footer="Sound Check plays every song at the same perceived loudness.">
          <ListRow icon="volume-high-outline" title="Sound Check" right={<Toggle value={on} onValueChange={setOn} accessibilityLabel="Sound Check" />} />
          <ListRow icon="musical-notes-outline" title="Crossfade" subtitle="6 seconds" chevron onPress={noop} />
        </InsetGroup>
      </View>
    );
  },
  MediaTile: () => {
    const sample = useSampleSongs();
    return (
      <View style={row}>
        {sample.slice(0, 2).map((s, i) => <MediaTile key={s._id} uri={s.coverArt} title={s.title} subtitle={s.artist} size={130} active={i === 0} playing onPress={noop} />)}
        {sample[2] ? <MediaTile uri={sample[2].coverArt} title={sample[2].artist} subtitle="Artist" size={130} round onPress={noop} /> : null}
      </View>
    );
  },
  GradientTile: () => (
    <View style={row}>
      <GradientTile title="Chill Mix" subtitle="Made for you" colors={['#5E5CE6', '#BF5AF2']} icon="shuffle" width={180} height={200} big brand="Hugo Music" onPress={noop} />
      <GradientTile title="gradientFor('Rock')" colors={gradientFor('Rock')} icon="flash" width={180} height={100} onPress={noop} />
    </View>
  ),
  PinnedRow: () => <Stage height={130}><View style={{ width: '90%' }}><PinnedRow icon="heart" colors={['#FF375F', '#FF9F0A']} title="Liked songs" subtitle="42 songs" onPress={noop} /></View></Stage>,
  GlassArt: () => <View style={row}><GlassArt width={96} height={96} radius={14} /><GlassArt width={96} height={96} radius={48} /></View>,
  Artwork: () => {
    const [s] = useSampleSongs(1);
    return <View style={row}><Artwork uri={s?.coverArt} title={s?.title} size={72} radius={10} /><Artwork title="No image" size={72} radius={10} /></View>;
  },
  Spinner: () => <View style={row}><Spinner /><Spinner size="large" /></View>,
  Chips: () => {
    const [v, setV] = useState('pending');
    return <Chips value={v} onChange={setV} options={[{ key: 'pending', label: 'Pending', count: 12 }, { key: 'published', label: 'Published', count: 980 }, { key: 'rejected', label: 'Rejected' }]} />;
  },
  FormField: () => {
    const [v, setV] = useState('');
    return <FormField label="Album title" value={v} onChange={setV} placeholder="e.g. Night Drive" />;
  },
  Badge: () => <View style={row}>{(['green', 'red', 'amber', 'blue', 'violet', 'gray'] as const).map((t) => <Badge key={t} label={t} tone={t} />)}<Badge label="Missing license" tone="red" icon="shield-outline" /></View>,
  Card: () => <Card title="Listening" subtitle="Last 7 days"><BarChart height={60} data={[3, 5, 2, 8, 6, 9, 4].map((value, i) => ({ label: `Day ${i + 1}`, value }))} /></Card>,
  StatCard: () => (
    <View style={[row, { alignItems: 'stretch' }]}>
      <StatCard icon="time-outline" tone="amber" label="Awaiting review" value={12} onPress={noop} />
      <StatCard icon="play-circle-outline" tone="green" label="Plays" value={1284} hint="+12% this week" />
    </View>
  ),
  BarChart: () => <BarChart height={80} data={[2, 4, 3, 7, 5, 9, 6, 8, 3, 0, 4, 6, 7, 10].map((value, i) => ({ label: `Day ${i + 1}`, value }))} />,
  EmptyState: () => <EmptyState icon="search-outline" title="Nothing matches" hint="Try another filter" />,
  Pager: () => {
    const [p, setP] = useState(2);
    return <Pager page={p} total={240} limit={30} onPage={setP} />;
  },
  ErrorText: () => <ErrorText message="Could not save: the title is longer than 200 characters." />,
  Sheet: () => {
    const [open, setOpen] = useState(false);
    const [v, setV] = useState('Night Drive');
    return (
      <View style={row}>
        <ActionButton variant="glass" title="Open sheet" onPress={() => setOpen(true)} />
        <Sheet visible={open} title="Edit album" subtitle="3 songs" onClose={() => setOpen(false)} footer={<ActionButton title="Save" onPress={() => setOpen(false)} />}>
          <FormField label="Album title" value={v} onChange={setV} />
        </Sheet>
      </View>
    );
  },
  HugoProvider: () => (
    <View style={row}>
      {(['light', 'dark'] as const).map((scheme) => (
        <HugoProvider key={scheme} scheme={scheme}>
          <Themed label={scheme} />
        </HugoProvider>
      ))}
    </View>
  ),
};

function GlassDemo() {
  const { colors } = useHugoTheme();
  const t = [styles.paneText, { color: colors.text }];
  return (
    <Stage>
      <View style={row}>
        <Glass style={styles.pane}><Text style={t}>regular</Text></Glass>
        <Glass variant="clear" style={styles.pane}><Text style={t}>clear</Text></Glass>
        <Glass tint="#0A84FF" style={styles.pane}><Text style={[styles.paneText, { color: '#fff' }]}>tinted</Text></Glass>
      </View>
    </Stage>
  );
}

function Themed({ label }: { label: string }) {
  const { colors } = useHugoTheme();
  return (
    <View style={{ backgroundColor: colors.background, padding: 16, borderRadius: 14, gap: 10, borderWidth: 1, borderColor: colors.cardBorder }}>
      <Text style={{ color: colors.text, fontWeight: '700' }}>scheme="{label}"</Text>
      <ActionButton title="Primary" onPress={noop} />
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { borderRadius: 14, overflow: 'hidden' },
  center: { alignItems: 'center', justifyContent: 'center' },
  pane: { width: 120, height: 80, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  paneText: { fontWeight: '700', fontSize: 15 },
});

export default demos;
