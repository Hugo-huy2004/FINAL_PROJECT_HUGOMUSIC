import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon, radius, space, type, useHugoTheme } from 'hugo-music';

// Renders the markdown subset the docs API uses (server guides, component READMEs): paragraphs, - and 1. lists,
// ``` code blocks, | tables |, **bold** and `code` spans. Anything else shows as plain text.
export const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, SFMono-Regular, Menlo, monospace' });

/** Dark code block with a Copy button (clipboard on the web; selectable text everywhere). */
export function CodeBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await (globalThis as any).navigator?.clipboard?.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable: the text is still selectable */ }
  };
  return (
    <View style={styles.code}>
      <View style={styles.codeHead}>
        <Text style={styles.codeLabel}>{label ?? ''}</Text>
        {Platform.OS === 'web' && (
          <Pressable onPress={copy} style={styles.copy} accessibilityRole="button" accessibilityLabel="Copy code">
            <Icon name={copied ? 'checkmark' : 'copy-outline'} size={14} color="#E5E5EA" />
            <Text style={styles.copyText}>{copied ? 'Copied' : 'Copy'}</Text>
          </Pressable>
        )}
      </View>
      <Text selectable style={styles.codeText}>{code}</Text>
    </View>
  );
}

function Inline({ text, color }: { text: string; color: string }) {
  const { colors } = useHugoTheme();
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g).filter(Boolean);
  return (
    <Text style={[type.callout, { color, lineHeight: 23 }]}>
      {parts.map((p, i) => p.startsWith('**') ? <Text key={i} style={{ fontWeight: '700', color: colors.text }}>{p.slice(2, -2)}</Text>
        : p.startsWith('`') ? <Text key={i} style={[styles.inlineCode, { backgroundColor: colors.fill, color: colors.text }]}>{p.slice(1, -1)}</Text>
        : p.startsWith('*') ? <Text key={i} style={{ fontStyle: 'italic' }}>{p.slice(1, -1)}</Text>
        : p)}
    </Text>
  );
}

export default function Markdown({ source }: { source: string }) {
  const { colors } = useHugoTheme();
  const blocks: React.ReactNode[] = [];
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('```')) {
      const code: string[] = [];
      while (++i < lines.length && !lines[i].startsWith('```')) code.push(lines[i]);
      blocks.push(<CodeBlock key={i} code={code.join('\n')} />);
    } else if (line.startsWith('|')) {
      const rows: string[][] = [];
      for (; i < lines.length && lines[i].startsWith('|'); i++) {
        if (!/^\|[\s:|-]+\|$/.test(lines[i].trim())) rows.push(lines[i].trim().slice(1, -1).split('|').map((c) => c.trim()));
      }
      i--;
      blocks.push(
        <View key={i} style={[styles.table, { borderColor: colors.border }]}>
          {rows.map((cells, r) => (
            <View key={r} style={[styles.tr, r > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, r === 0 && { backgroundColor: colors.fill }]}>
              {cells.map((c, k) => <View key={k} style={styles.td}><Inline text={r === 0 ? `**${c}**` : c} color={colors.textSecondary} /></View>)}
            </View>
          ))}
        </View>,
      );
    } else if (/^(- |\d+\. )/.test(line)) {
      const items: string[] = [];
      for (; i < lines.length && /^(- |\d+\. )/.test(lines[i]); i++) items.push(lines[i]);
      i--;
      blocks.push(
        <View key={i} style={styles.list}>
          {items.map((it, n) => {
            const bullet = it.startsWith('- ') ? '•' : `${it.match(/^\d+/)![0]}.`;
            return (
              <View key={n} style={styles.item}>
                <Text style={[type.callout, styles.bullet, { color: colors.accent }]}>{bullet}</Text>
                <View style={{ flex: 1 }}><Inline text={it.replace(/^(- |\d+\. )/, '')} color={colors.textSecondary} /></View>
              </View>
            );
          })}
        </View>,
      );
    } else if (line.trim()) {
      const para: string[] = [line];
      while (i + 1 < lines.length && lines[i + 1].trim() && !/^(- |\d+\. |```|\|)/.test(lines[i + 1])) para.push(lines[++i]);
      blocks.push(<Inline key={i} text={para.join(' ')} color={colors.textSecondary} />);
    }
  }
  return <View style={styles.doc}>{blocks}</View>;
}

const styles = StyleSheet.create({
  doc: { gap: space.md },
  list: { gap: 6 },
  table: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, overflow: 'hidden' },
  tr: { flexDirection: 'row' },
  td: { flex: 1, padding: space.sm },
  item: { flexDirection: 'row', gap: 8 },
  bullet: { minWidth: 18, fontWeight: '700' },
  inlineCode: { fontFamily: mono, fontSize: 13.5, borderRadius: 4 },
  code: { backgroundColor: '#1C1C1E', borderRadius: radius.lg, padding: space.md, gap: 6 },
  codeHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 18 },
  codeLabel: { color: '#8E8E93', fontSize: 12, fontWeight: '600' },
  copy: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.12)' },
  copyText: { color: '#E5E5EA', fontSize: 12, fontWeight: '600' },
  codeText: { fontFamily: mono, fontSize: 13, color: '#E5E5EA', lineHeight: 20 },
});
