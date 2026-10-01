import { useMemo } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { useAppTheme } from '../../theme/theme';
import type { Chart } from './charts';

// Ảnh bìa bảng xếp hạng (kiểu "Top 100 · Global" của Apple Music): "Top N" + phạm vi + một mảng ô
// màu chuyển từ màu 1 sang màu 2, độ đậm từng ô cố định theo tên bảng (không đổi mỗi lần vẽ).
const LOGO = require('../../../assets/logo-cover.png');
const COLS = 6;
const ROWS = 4;

function hashSeed(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return () => ((h = Math.imul(h ^ (h >>> 13), 1274126177)) >>> 0) / 4294967295;
}
const mix = (a: string, b: string, t: number) => {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(',')})`;
};

export default function ChartArt({ chart, size, radius = 12 }: { chart: Chart; size: number; radius?: number }) {
  const { colors, isDark } = useAppTheme();
  const cells = useMemo(() => {
    const rnd = hashSeed(chart.id);
    return Array.from({ length: COLS * ROWS }, (_, i) => {
      const col = i % COLS;
      return { color: mix(chart.colors[0], chart.colors[1], col / (COLS - 1)), opacity: 0.45 + rnd() * 0.55 };
    });
  }, [chart.id]);
  const pad = size * 0.06;
  const cell = (size - pad * 2) / COLS;
  return (
    <View style={[styles.card, { borderRadius: radius, width: size, height: size, padding: pad, backgroundColor: isDark ? '#1C1C1E' : '#F4F4F6' }]}>
      <View style={styles.head}>
        <Text style={[styles.top, { color: colors.text, fontSize: size * 0.1 }]}>Top {chart.size}</Text>
        <Image source={LOGO} style={{ width: size * 0.1, height: size * 0.1 }} />
      </View>
      <Text style={[styles.scope, { color: colors.text, fontSize: size * 0.11 }]} numberOfLines={1} adjustsFontSizeToFit>{chart.scope}</Text>
      <View style={[styles.grid, { marginTop: pad * 0.6 }]}>
        {cells.map((c, i) => (
          <View key={i} style={{ width: cell, height: cell, backgroundColor: c.color, opacity: c.opacity }} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  top: { fontWeight: '800', letterSpacing: -0.5 },
  scope: { fontWeight: '800', letterSpacing: -0.6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', flex: 1, alignContent: 'flex-end' },
});
