import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, LayoutChangeEvent } from 'react-native';
import { audioEngine } from '../../audio/audioEngine';
import { Lyrics, activeLine, activeWord } from './useLyrics';
import { Spinner } from 'hugo-music';

// Apple Music-style lyrics: the line being sung is bright, loud, and always located about 1/3 of the way up the frame;
// Past lines fade, upcoming lines become fainter. There are landmarks for each word, the words will light up one after another at the right time to sing.
// Position reads STRAIGHT from the transmitter ~20 times/second (store only updates ~4 times/second — not enough to match letters).
// Touch a line to fast forward there. The user scrolls automatically and pauses scrolling for 4 seconds.
const TICK_MS = 50;
const FOLLOW_PAUSE_MS = 4000;

function useLivePosition(fallback: number, enabled: boolean) {
  const [pos, setPos] = useState(fallback);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const tick = async () => {
      const p = await audioEngine.getPosition().catch(() => null);
      if (alive && p != null) setPos(p);
      if (alive) timer = setTimeout(tick, TICK_MS);
    };
    let timer = setTimeout(tick, 0);
    return () => { alive = false; clearTimeout(timer); };
  }, [enabled]);
  return enabled ? pos : fallback;
}

export default function LyricsView({ lyrics, position, onSeek }: {
  lyrics: Lyrics; position: number; onSeek: (seconds: number) => void;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const offsets = useRef<number[]>([]);
  const [boxHeight, setBoxHeight] = useState(0);
  const userScrollAt = useRef(0);
  const live = useLivePosition(position, !!lyrics.synced);
  const current = lyrics.synced ? activeLine(lyrics.synced, live) : -1;

  useEffect(() => {
    if (current < 0 || offsets.current[current] === undefined) return;
    if (Date.now() - userScrollAt.current < FOLLOW_PAUSE_MS) return;
    scrollRef.current?.scrollTo({ y: Math.max(0, offsets.current[current] - boxHeight * 0.3), animated: true });
  }, [current, boxHeight]);

  if (lyrics.status === 'loading') return <Spinner color="#fff" style={{ marginTop: 40 }} />;
  if (lyrics.status === 'none') return <Text style={styles.empty}>Bài này chưa có lời.</Text>;

  if (!lyrics.synced) {
    return (
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.plain}>{lyrics.plain}</Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      ref={scrollRef}
      onLayout={(e: LayoutChangeEvent) => setBoxHeight(e.nativeEvent.layout.height)}
      onScrollBeginDrag={() => { userScrollAt.current = Date.now(); }}
      contentContainerStyle={[styles.content, { paddingTop: boxHeight * 0.25 }]}
      showsVerticalScrollIndicator={false}
    >
      {lyrics.synced.map((line, i) => {
        const isCurrent = i === current;
        const w = isCurrent ? activeWord(line, live) : -1;
        return (
          <Pressable
            key={`${line.time}-${i}`}
            onPress={() => onSeek(line.time)}
            onLayout={(e) => { offsets.current[i] = e.nativeEvent.layout.y; }}
            accessibilityRole="button"
            accessibilityLabel={`Tua tới: ${line.text}`}
          >
            {isCurrent && line.words ? (
              <Text style={[styles.line, styles.lineCurrentWords]}>
                {line.words.map((word, k) => (
                  <Text key={k} style={k <= w ? styles.wordSung : undefined}>{word.text}</Text>
                ))}
              </Text>
            ) : (
              <Text style={[styles.line, isCurrent ? styles.lineActive : i < current ? styles.linePast : null]}>{line.text}</Text>
            )}
          </Pressable>
        );
      })}
      <View style={{ height: boxHeight * 0.6 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 24, paddingHorizontal: 4 },
  line: { color: 'rgba(255,255,255,0.3)', fontSize: 28, fontWeight: '800', lineHeight: 36, marginVertical: 9, letterSpacing: -0.5 },
  lineActive: { color: '#fff' },
  lineCurrentWords: { color: 'rgba(255,255,255,0.4)' },
  wordSung: { color: '#fff' },
  linePast: { color: 'rgba(255,255,255,0.45)' },
  plain: { color: 'rgba(255,255,255,0.85)', fontSize: 20, lineHeight: 30, fontWeight: '700' },
  empty: { color: 'rgba(255,255,255,0.6)', fontSize: 16, textAlign: 'center', marginTop: 40 },
});
