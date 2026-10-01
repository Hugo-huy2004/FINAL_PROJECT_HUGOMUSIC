import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, Image, Pressable, StyleSheet, Animated, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Glass, GlassButton, HugoProvider, NavigationSidebar, SegmentedControl, useHugoTheme, type SidebarSection } from 'hugo-music';
import ComponentLibrary, { GROUP_ICONS, useComponentDocs } from './ComponentLibrary';
import ApiReference, { METHOD_COLOR } from './ApiReference';
import { useApiDocs, groupKey } from './apiDocs';

// Developer docs as an Apple split view: a Liquid Glass sidebar (hugo-music NavigationSidebar) picks one page,
// the content column shows only that page. Every page has its own URL:
//   /developer/components[/<Component>]   library + app components, generated from source
//   /developer/api[/<group> | /realtime]  API reference generated from the live route tree
// Phones get the sidebar as a slide-over opened from the navigation bar.
export type DeveloperSection = 'components' | 'api';
export const DEVELOPER_ROUTES: Record<DeveloperSection, string> = { components: 'DeveloperComponents', api: 'DeveloperApi' };
const BAR = 60;
const SIDEBAR = 290;

export default function DeveloperScreen({ section }: { section: DeveloperSection }) {
  const [appearance, setAppearance] = useState<'light' | 'dark'>('light');
  return (
    <HugoProvider scheme={appearance}>
      <Page section={section} appearance={appearance} setAppearance={setAppearance} />
    </HugoProvider>
  );
}

function useSections(section: DeveloperSection): SidebarSection[] {
  const { data } = useApiDocs();
  const { data: lib } = useComponentDocs();
  return useMemo(() => {
    if (section === 'components') {
      const list = lib?.components ?? [];
      const groups = [...new Set(list.map((c) => c.group))];
      return [
        { items: [{ key: 'overview', label: 'Overview' }] },
        ...groups.map((g) => ({
          title: g, icon: GROUP_ICONS[g],
          items: list.filter((c) => c.group === g).map((c) => ({ key: c.name, label: c.name, keywords: `${c.description} ${c.usage}` })),
        })),
      ];
    }
    return [
      { items: [{ key: 'overview', label: 'Guide' }, { key: 'realtime', label: 'Realtime events', trailing: data ? String(data.socketEvents.length) : undefined }] },
      {
        title: 'REST', icon: 'server-outline' as const,
        items: (data?.groups ?? []).map((g) => ({
          key: groupKey(g), label: g.title, trailing: String(g.routes.length),
          // filtering by a path or a word of a summary finds the group that holds the endpoint
          keywords: g.routes.map((r) => `${r.method} ${r.path} ${r.summary ?? ''}`).join(' '),
          leading: <View style={[styles.dot, { backgroundColor: METHOD_COLOR[g.routes[0]?.method] ?? '#8E8E93' }]} />,
        })),
      },
    ];
  }, [section, data, lib]);
}

function Page({ section, appearance, setAppearance }: { section: DeveloperSection; appearance: 'light' | 'dark'; setAppearance: (a: 'light' | 'dark') => void }) {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { colors } = useHugoTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const pad = width >= 900 ? 24 : 16;
  const selected: string = route.params?.item || 'overview';
  const sections = useSections(section);
  const content = useRef<ScrollView>(null);
  const [drawer, setDrawer] = useState(false);
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => { content.current?.scrollTo({ y: 0, animated: false }); }, [selected, section]);
  useEffect(() => { Animated.spring(slide, { toValue: drawer ? 1 : 0, damping: 20, stiffness: 220, useNativeDriver: true }).start(); }, [drawer]);

  const select = (item: string) => {
    navigation.setParams({ item: item === 'overview' ? undefined : item });
    setDrawer(false);
  };
  const top = insets.top + BAR + 20;
  const sidebar = (
    <NavigationSidebar sections={sections} selected={selected} onSelect={select}
      searchPlaceholder={section === 'components' ? 'Filter components' : 'Filter endpoints'} style={styles.fill} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.split, { paddingTop: top, paddingHorizontal: pad }]}>
        {wide && <View style={[styles.sidebar, { marginBottom: 16 + insets.bottom }]}>{sidebar}</View>}
        <ScrollView ref={content} style={styles.fill} contentContainerStyle={{ paddingBottom: 64 + insets.bottom, paddingLeft: wide ? 24 : 0, maxWidth: 1040 }}>
          {section === 'components' ? <ComponentLibrary selected={selected} onSelect={select} /> : <ApiReference selected={selected} />}
        </ScrollView>
      </View>

      {!wide && (
        <View style={[StyleSheet.absoluteFill, { pointerEvents: drawer ? 'auto' : 'none' }]}>
          <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, { opacity: slide }]}>
            <Pressable style={styles.fill} onPress={() => setDrawer(false)} accessibilityLabel="Close sidebar" />
          </Animated.View>
          <Animated.View style={[styles.drawer, { top, bottom: 16 + insets.bottom, left: pad, transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [-(SIDEBAR + pad + 20), 0] }) }] }]}>
            {sidebar}
          </Animated.View>
        </View>
      )}

      <View style={[styles.barWrap, { top: insets.top + 10, paddingHorizontal: pad, pointerEvents: 'box-none' }]}>
        <Glass style={styles.bar}>
          {!wide && <GlassButton icon={drawer ? 'close' : 'list'} label={drawer ? 'Close sidebar' : 'Open sidebar'} size={40} iconSize={20} onPress={() => setDrawer(!drawer)} />}
          <Image source={require('../../../assets/logo.png')} style={styles.logo} />
          {width >= 760 && <Text style={[styles.brand, { color: colors.text }]} numberOfLines={1}>Hugo Music · Developer</Text>}
          <View style={styles.segments}>
            <SegmentedControl
              value={section}
              onChange={(k) => navigation.navigate(DEVELOPER_ROUTES[k as DeveloperSection])}
              segments={[{ key: 'components', label: 'Components' }, { key: 'api', label: 'API' }]}
            />
          </View>
          {(
            <GlassButton icon={appearance === 'dark' ? 'sunny-outline' : 'moon-outline'} label={appearance === 'dark' ? 'Light appearance' : 'Dark appearance'}
              size={40} iconSize={19} onPress={() => setAppearance(appearance === 'dark' ? 'light' : 'dark')} />
          )}
          <GlassButton icon="musical-notes-outline" label="Back to the music app" size={40} iconSize={19} onPress={() => navigation.navigate('Home')} />
        </Glass>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  split: { flex: 1, flexDirection: 'row', alignSelf: 'center', width: '100%', maxWidth: 1360 },
  sidebar: { width: SIDEBAR },
  drawer: { position: 'absolute', width: SIDEBAR },
  scrim: { backgroundColor: 'rgba(0,0,0,0.25)' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  barWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 10, height: BAR, paddingHorizontal: 10, width: '100%', maxWidth: 1360 },
  logo: { width: 36, height: 36, borderRadius: 18 },
  brand: { fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },
  segments: { flex: 1, maxWidth: 280, marginLeft: 'auto' },
});
