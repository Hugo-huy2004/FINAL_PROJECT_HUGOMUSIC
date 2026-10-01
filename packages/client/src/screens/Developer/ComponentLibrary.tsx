import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Icon, radius, SegmentedControl, space, type, useHugoTheme } from 'hugo-music';
import { useApi } from 'hugo-api';
import { DEMOS } from './generated/demos';
import Markdown, { CodeBlock, mono } from './Markdown';
import type { ComponentDoc, ComponentDocs } from './types';

// Component library. Everything on it comes from GET /api/docs/components, which is generated from the UI source
// (JSDoc, @usage/@remarks/@a11y/@example tags, prop types, the library README) — only the live demos are code.
// One page per sidebar item: 'overview' or a component name.
export const GROUP_ICONS: Record<string, 'color-palette-outline' | 'water-outline' | 'options-outline' | 'navigate-outline' | 'grid-outline' | 'musical-notes-outline' | 'apps-outline' | 'stats-chart-outline'> = {
  Theme: 'color-palette-outline', Glass: 'water-outline', Controls: 'options-outline', Navigation: 'navigate-outline',
  Layout: 'grid-outline', 'App UI kit': 'musical-notes-outline', 'App components': 'apps-outline', 'Data display': 'stats-chart-outline',
};

export const useComponentDocs = () => useApi<ComponentDocs>('GET /api/docs/components');

export default function ComponentLibrary({ selected = 'overview', onSelect }: { selected?: string; onSelect: (key: string) => void }) {
  const { colors } = useHugoTheme();
  const { data, error } = useComponentDocs();
  if (error) return <Text style={[type.body, { color: '#FF3B30' }]}>Could not load /api/docs/components: {error.message}</Text>;
  if (!data) return <Text style={[type.body, { color: colors.textSecondary }]}>Loading the component library…</Text>;
  const list = data.components;
  const index = list.findIndex((c) => c.name === selected);
  const c = list[index];
  if (c) {
    const siblings = list.filter((x) => x.group === c.group && x.name !== c.name);
    const prev = list[index - 1];
    const next = list[index + 1];
    return (
      <View>
        <ComponentPage key={c.name} c={c} />
        {!!siblings.length && (
          <>
            <Text style={[type.headline, styles.h3, { color: colors.text }]}>More in {c.group}</Text>
            <View style={styles.wrap}>{siblings.map((x) => <Pill key={x.name} label={x.name} onPress={() => onSelect(x.name)} />)}</View>
          </>
        )}
        <View style={styles.pager}>
          {prev ? <Pill icon="chevron-back" label={prev.name} onPress={() => onSelect(prev.name)} /> : <View />}
          {next ? <Pill label={next.name} trailingIcon="chevron-forward" onPress={() => onSelect(next.name)} /> : <View />}
        </View>
      </View>
    );
  }
  const groups = [...new Set(list.map((x) => x.group))];
  return (
    <View>
      <Text style={[type.caption, { color: colors.accent, letterSpacing: 0.6 }]}>{data.package.name.toUpperCase()} · v{data.package.version} · {data.package.license}</Text>
      <Text style={[styles.hero, { color: colors.text }]} accessibilityRole="header">Hugo Music</Text>
      <Text style={[type.title3, { color: colors.textSecondary, fontWeight: '500', marginBottom: space.lg }]}>{data.package.description}.</Text>
      <View style={[styles.card, { backgroundColor: colors.surface }]}><Markdown source={data.intro} /></View>
      {data.guide.filter((g) => g.title !== 'License').map((g) => (
        <View key={g.title} style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[type.title3, { color: colors.text }]}>{g.title}</Text>
          <Markdown source={g.body} />
        </View>
      ))}
      <Tokens />
      <Text style={[type.title2, styles.h2, { color: colors.text }]}>All components</Text>
      {groups.map((g) => (
        <View key={g} style={{ marginBottom: space.lg }}>
          <Text style={[type.footnote, styles.groupTitle, { color: colors.textSecondary }]}>{g.toUpperCase()}</Text>
          <View style={styles.wrap}>{list.filter((x) => x.group === g).map((x) => <Pill key={x.name} label={x.name} onPress={() => onSelect(x.name)} />)}</View>
        </View>
      ))}
      <Text style={[type.footnote, styles.footer, { color: colors.textTertiary }]}>
        {list.length} components generated from source ({list.filter((x) => x.package).length} in {data.package.name}) · {list.filter((x) => DEMOS[x.name]).length} with a live demo · served by GET /api/docs/components
      </Text>
    </View>
  );
}

function Pill({ label, onPress, icon, trailingIcon }: { label: string; onPress: () => void; icon?: 'chevron-back'; trailingIcon?: 'chevron-forward' }) {
  const { colors } = useHugoTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => [styles.pill, { backgroundColor: pressed ? colors.activeItemBg : colors.fill }]}>
      {icon && <Icon name={icon} size={15} color={colors.accent} />}
      <Text style={[styles.pillText, { color: colors.text }]}>{label}</Text>
      {trailingIcon && <Icon name={trailingIcon} size={15} color={colors.accent} />}
    </Pressable>
  );
}

/** Design tokens rendered from the live values of the library. */
function Tokens() {
  const { colors } = useHugoTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <Text style={[type.title3, { color: colors.text }]}>Design tokens</Text>
      <View style={styles.swatches}>
        {Object.entries(colors).filter(([, v]) => typeof v === 'string').map(([k, v]) => (
          <View key={k} style={{ width: 104 }}>
            <View style={{ height: 36, borderRadius: 10, backgroundColor: String(v), borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }} />
            <Text style={[type.caption, { color: colors.text, marginTop: 4 }]} numberOfLines={1}>{k}</Text>
          </View>
        ))}
      </View>
      <View style={{ gap: 2 }}>
        {Object.entries(type).map(([k, t]) => <Text key={k} style={[t, { color: colors.text }]}>{k} · {t.fontSize} pt</Text>)}
      </View>
      <View style={[styles.swatches, { alignItems: 'flex-end' }]}>
        {Object.entries(space).map(([k, v]) => (
          <View key={k} style={{ alignItems: 'center', gap: 4 }}>
            <View style={{ width: v, height: v, backgroundColor: colors.accent, borderRadius: 2 }} />
            <Text style={[styles.tiny, { color: colors.textSecondary }]}>{k} {v}</Text>
          </View>
        ))}
        {Object.entries(radius).map(([k, v]) => (
          <View key={k} style={{ alignItems: 'center', gap: 4 }}>
            <View style={{ width: 32, height: 32, borderRadius: Math.min(v, 16), borderWidth: 2, borderColor: colors.accent }} />
            <Text style={[styles.tiny, { color: colors.textSecondary }]}>{k} {v}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

type SectionIcon = 'bulb-outline' | 'cog-outline' | 'accessibility-outline' | 'code-slash-outline' | 'list-outline' | 'play-circle-outline';
function Section({ title, icon, children }: { title: string; icon: SectionIcon; children: React.ReactNode }) {
  const { colors } = useHugoTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <View style={styles.cardHead}>
        <Icon name={icon} size={19} color={colors.accent} />
        <Text style={[type.headline, { color: colors.text }]}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function ComponentPage({ c }: { c: ComponentDoc }) {
  const { colors } = useHugoTheme();
  const Demo = DEMOS[c.name];
  const [ex, setEx] = useState(0);
  const importLine = c.importStyle === 'default' ? `import ${c.name} from '${c.importFrom}';` : `import { ${c.name} } from '${c.importFrom}';`;
  const tag = (label: string, tint?: string) => (
    <View key={label} style={[styles.tag, { backgroundColor: tint ? tint + '22' : colors.fill }]}>
      <Text style={[styles.tagText, { color: tint ?? colors.textSecondary }]}>{label}</Text>
    </View>
  );
  return (
    <View>
      <View style={styles.tags}>
        {c.package ? tag(c.package, colors.accent) : tag('app')}
        {tag(c.group)}
        {c.platforms.filter((p) => p !== 'default').map((p) => tag(`${p} variant`, '#0A84FF'))}
      </View>
      <Text style={[styles.hero, { color: colors.text }]} accessibilityRole="header">{c.name}</Text>
      <Text style={[type.title3, { color: colors.textSecondary, fontWeight: '500' }]}>{c.description}</Text>
      <Text style={[styles.tiny, { color: colors.textTertiary, marginTop: 8, marginBottom: space.lg }]}>{c.file}</Text>

      <Section title="Live demo" icon="play-circle-outline">
        <View style={[styles.canvas, { backgroundColor: colors.background, borderColor: colors.border }]}>
          {Demo ? <Demo /> : <Text style={[type.footnote, { color: colors.textSecondary }]}>No live demo yet — export one keyed “{c.name}” from any *.demos.tsx file.</Text>}
        </View>
      </Section>
      {!!c.usage && <Section title="When to use" icon="bulb-outline"><Markdown source={c.usage} /></Section>}
      {!!c.remarks && <Section title="How it works" icon="cog-outline"><Markdown source={c.remarks} /></Section>}
      {!!c.a11y && <Section title="Accessibility" icon="accessibility-outline"><Markdown source={c.a11y} /></Section>}
      <Section title={`Examples (${c.examples.length})`} icon="code-slash-outline">
        {c.examples.length > 1 && (
          <SegmentedControl value={String(ex)} onChange={(k) => setEx(Number(k))} style={{ maxWidth: 80 * c.examples.length }}
            segments={c.examples.map((_, i) => ({ key: String(i), label: `${i + 1}` }))} />
        )}
        <CodeBlock label="Copy into your screen" code={`${importLine}\n\n${c.examples[ex] ?? c.examples[0]}`} />
      </Section>
      <Section title={`Props (${c.props.length})`} icon="list-outline">
        <View style={[styles.props, { backgroundColor: colors.background }]}>
          {c.props.map((p, i) => (
            <View key={p.name} style={[styles.prop, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}>
              <View style={{ width: 170 }}>
                <Text style={[styles.mono, { color: colors.text, fontWeight: '700' }]}>{p.name}{p.required ? '' : '?'}</Text>
                {p.default != null && <Text style={[styles.mono, { color: colors.textTertiary, fontSize: 12 }]}>= {p.default}</Text>}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.mono, { color: '#AF52DE', fontSize: 12 }]} numberOfLines={3}>{p.type}</Text>
                {!!p.description && <Text style={[type.footnote, { color: colors.textSecondary }]}>{p.description}</Text>}
              </View>
              {p.required && tag('required', '#FF9500')}
            </View>
          ))}
          {!c.props.length && <Text style={[type.footnote, { color: colors.textSecondary, padding: space.md }]}>No props.</Text>}
          {!!c.inherited.length && (
            <Text style={[type.footnote, { color: colors.textSecondary, padding: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}>
              Also accepts {c.inherited.reduce((n, x) => n + x.count, 0)} inherited props ({c.inherited.map((x) => x.from).join(', ')}).
            </Text>
          )}
        </View>
      </Section>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { fontSize: 40, lineHeight: 46, fontWeight: '800', letterSpacing: -1, marginTop: 4 },
  h2: { marginTop: space.xxl, marginBottom: space.md },
  h3: { marginTop: space.xl, marginBottom: space.sm },
  card: { borderRadius: radius.xl, padding: space.xl, marginBottom: space.lg, gap: space.md },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tiny: { fontFamily: mono, fontSize: 11 },
  groupTitle: { fontWeight: '600', letterSpacing: 0.4, marginBottom: space.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pager: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.xxl },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, height: 34, borderRadius: 999 },
  pillText: { fontSize: 14, fontWeight: '600' },
  tags: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  tagText: { fontSize: 12, fontWeight: '600' },
  canvas: { borderRadius: radius.lg, padding: space.xl, borderWidth: StyleSheet.hairlineWidth, gap: space.md },
  props: { borderRadius: radius.lg, overflow: 'hidden' },
  prop: { flexDirection: 'row', gap: 12, padding: space.md, alignItems: 'flex-start' },
  mono: { fontFamily: mono, fontSize: 13 },
  footer: { textAlign: 'center', marginTop: space.xxl },
});
