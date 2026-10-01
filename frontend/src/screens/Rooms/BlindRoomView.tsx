import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import ChromeScrollView from '../../ui/ChromeScrollView';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useStore } from '../../store/useStore';
import { useAppTheme, ThemeColors } from '../../theme/theme';
import { useIsMobile } from '../../utils/responsive';
import { useRooms, leaveRoom, replaySide, castVote, Choice, Condition, Trial } from '../../rooms/useRooms';
import { serverNow } from '../../rooms/serverClock';
import { DropletPressable } from '../../ui/kit';
import { type, space, radius } from '../../ui/tokens';

// Phòng nghe mù: Nghe A → Nghe B → Chọn → Kết quả, rồi lượt mới tự bắt đầu (backend/rooms/blindTest.js).
// Kết quả cho từng người biết mình đúng/sai; bảng điểm của phòng; độ khó tự thích ứng theo cả phòng.
type Phase = 'waiting' | 'prepare' | 'A' | 'gap' | 'B' | 'vote' | 'reveal';

function phaseOf(t: Trial | null, now: number): { phase: Phase; start: number; end: number } {
  if (!t) return { phase: 'waiting', start: now, end: now };
  const L = t.excerptSeconds * 1000;
  if (now < t.aAt) return { phase: 'prepare', start: t.aAt - 3000, end: t.aAt };
  if (now < t.aAt + L) return { phase: 'A', start: t.aAt, end: t.aAt + L };
  if (now < t.bAt) return { phase: 'gap', start: t.aAt + L, end: t.bAt };
  if (now < t.bAt + L) return { phase: 'B', start: t.bAt, end: t.bAt + L };
  if (now < t.voteUntil) return { phase: 'vote', start: t.bAt + L, end: t.voteUntil };
  return { phase: 'reveal', start: t.voteUntil, end: t.revealUntil };
}

const STEPS: { phases: Phase[]; label: string }[] = [
  { phases: ['prepare', 'A'], label: 'Nghe A' },
  { phases: ['gap', 'B'], label: 'Nghe B' },
  { phases: ['vote'], label: 'Chọn' },
  { phases: ['reveal'], label: 'Kết quả' },
];
const HEADLINE: Record<Phase, string> = {
  waiting: 'Đang chọn đoạn nhạc…',
  prepare: 'Sẵn sàng…',
  A: 'Đang phát A',
  gap: 'Tiếp theo là B',
  B: 'Đang phát B',
  vote: 'Bản nào nghe hay hơn?',
  reveal: 'Kết quả',
};
const CHOICES: [Choice, string][] = [['A', 'A hay hơn'], ['same', 'Không phân biệt'], ['B', 'B hay hơn']];
const conditionLabel = (c: Condition) => (c.key === 'original' ? 'Tệp gốc' : `${c.kbps} kbps`);
const rank = (c: Condition) => (c.key === 'original' ? Infinity : c.kbps || 0);

export default function BlindRoomView() {
  const { colors } = useAppTheme();
  const isMobile = useIsMobile();
  const user = useStore((s) => s.user);
  const blind = useRooms((s) => s.blind);
  const myVote = useRooms((s) => s.myVote);
  const reveal = useRooms((s) => s.reveal);
  const votesIn = useRooms((s) => s.votesIn);
  const playingSide = useRooms((s) => s.playingSide);
  const error = useRooms((s) => s.error);
  const [now, setNow] = useState(serverNow());
  const [voteError, setVoteError] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(serverNow()), 100);
    return () => clearInterval(t);
  }, []);

  const styles = makeStyles(colors);
  if (!blind) return <View style={{ flex: 1 }} />;

  const trial = blind.trial;
  const { phase, start, end } = phaseOf(trial, now);
  const secondsLeft = Math.max(0, Math.ceil((end - now) / 1000));
  const phaseProgress = end > start ? Math.min(1, Math.max(0, (now - start) / (end - start))) : 0;
  const canVote = !!trial && now >= trial.voteFrom && now <= trial.voteUntil;
  const shownReveal = reveal && trial && reveal.trialId === trial.id ? reveal : null;
  const stepIndex = STEPS.findIndex((s) => s.phases.includes(phase));
  const mine = shownReveal && user ? shownReveal.correct[user._id] : undefined;
  const [c1, c2] = blind.room.colors;

  const vote = async (choice: Choice) => {
    setVoteError(null);
    try {
      await castVote(choice);
    } catch (e: any) {
      setVoteError(e.message);
    }
  };

  const tile = (side: 'A' | 'B') => {
    const active = playingSide === side;
    const cond = shownReveal ? shownReveal[side === 'A' ? 'a' : 'b'] : null;
    const other = shownReveal ? shownReveal[side === 'A' ? 'b' : 'a'] : null;
    const higher = cond && other && rank(cond) > rank(other);
    return (
      <View style={[styles.tile, { borderColor: active ? c2 : colors.border }]}>
        {active && <LinearGradient colors={[c1, c2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />}
        <Text style={[styles.tileLetter, active && { color: '#fff' }]}>{side}</Text>
        {active && (
          <View style={styles.row}>
            <Ionicons name="volume-high" size={14} color="#fff" />
            <Text style={styles.playingText}>đang phát</Text>
          </View>
        )}
        {cond && (
          <Text style={[styles.tileReveal, { color: higher ? colors.accent : colors.text }]}>
            {conditionLabel(cond)}{higher ? ' ↑' : ''}
          </Text>
        )}
        {phase === 'vote' && (
          <DropletPressable onPress={() => replaySide(side)} label={`Nghe lại ${side}`} style={[styles.replay, { backgroundColor: colors.fill }]}>
            <View style={styles.row}>
              <Ionicons name="refresh" size={14} color={colors.accent} />
              <Text style={[styles.replayText, { color: colors.accent }]}>Nghe lại</Text>
            </View>
          </DropletPressable>
        )}
      </View>
    );
  };

  const hint = myVote && votesIn
    ? `Đã chọn · ${votesIn.voted}/${votesIn.listeners} người đã chọn — đủ người là công bố ngay`
    : canVote
      ? 'Đổi ý được tới hết giờ.'
      : phase === 'prepare' || phase === 'A' || phase === 'gap'
        ? 'Hai bản là cùng một đoạn nhạc. Nên đeo tai nghe.'
        : '';

  return (
    <ChromeScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: isMobile ? 18 : 28, paddingTop: 4, paddingBottom: 160, maxWidth: 640, width: '100%', alignSelf: 'center' }}
    >
      <Text style={[styles.title, { fontSize: isMobile ? 28 : 34 }]} numberOfLines={1}>{blind.room.name}</Text>
      <View style={styles.metaRow}>
        <Text style={styles.meta}>{blind.listenerCount} người · Lượt {trial?.no ?? 0}</Text>
        {trial?.difficulty ? (
          <View style={[styles.chip, { backgroundColor: colors.fill }]}><Text style={styles.chipText}>Độ khó: {trial.difficulty}</Text></View>
        ) : null}
        <DropletPressable onPress={() => leaveRoom()} label="Rời phòng" style={[styles.chip, styles.leave, { backgroundColor: colors.fill }]}>
          <Text style={[styles.chipText, { color: '#FF453A' }]}>Rời phòng</Text>
        </DropletPressable>
      </View>

      <View style={styles.steps}>
        {STEPS.map((s, i) => (
          <View key={s.label} style={styles.step}>
            <View style={[styles.stepTrack, { backgroundColor: colors.fill }]}>
              <View style={[styles.stepFill, { backgroundColor: colors.accent, width: `${i < stepIndex ? 100 : i === stepIndex ? phaseProgress * 100 : 0}%` }]} />
            </View>
            <Text style={[styles.stepText, i === stepIndex && { color: colors.text, fontWeight: '700' }]}>{s.label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.headlineRow} accessibilityLiveRegion="polite">
        <Text style={styles.headline}>{HEADLINE[phase]}</Text>
        {phase !== 'waiting' && <Text style={styles.countdown}>{secondsLeft}s</Text>}
      </View>

      <View style={styles.tiles}>
        {tile('A')}
        {tile('B')}
      </View>

      {!shownReveal && (
        <>
          <View style={styles.voteRow}>
            {CHOICES.map(([choice, label]) => {
              const selected = myVote === choice;
              return (
                <DropletPressable
                  key={choice}
                  disabled={!canVote}
                  onPress={() => vote(choice)}
                  label={label}
                  selected={selected}
                  style={[styles.voteBtn, { borderColor: colors.border }, selected && { backgroundColor: colors.accent, borderColor: colors.accent }, !canVote && !selected && { opacity: 0.4 }]}
                >
                  <Text style={[styles.voteText, selected && { color: '#fff' }]}>{label}</Text>
                </DropletPressable>
              );
            })}
          </View>
          {hint ? <Text style={styles.small}>{hint}</Text> : null}
        </>
      )}
      {(voteError || error) && <Text style={styles.error}>{voteError || error}</Text>}

      {shownReveal && trial && (
        <View style={[styles.result, { backgroundColor: colors.surface }]}>
          {mine !== undefined && (
            <View style={styles.row}>
              <Ionicons name={mine ? 'checkmark-circle' : 'close-circle'} size={26} color={mine ? '#30D158' : '#FF453A'} />
              <Text style={[type.title3, { color: colors.text }]}>{mine ? 'Bạn đoán đúng!' : 'Chưa đúng'}</Text>
            </View>
          )}
          <Text style={styles.resultTitle}>
            {shownReveal.control ? 'Lượt kiểm tra: hai bản giống hệt nhau' : `A = ${conditionLabel(shownReveal.a)} · B = ${conditionLabel(shownReveal.b)}`}
          </Text>
          {(['A', 'same', 'B'] as const).map((k) => {
            const total = shownReveal.tally.A + shownReveal.tally.B + shownReveal.tally.same || 1;
            const n = shownReveal.tally[k];
            return (
              <View key={k} style={styles.barRow}>
                <Text style={styles.barLabel}>{k === 'same' ? 'Không phân biệt' : `${k} hay hơn`}</Text>
                <View style={[styles.barTrack, { backgroundColor: colors.fill }]}>
                  <View style={[styles.barFill, { width: `${(n / total) * 100}%`, backgroundColor: colors.accent }]} />
                </View>
                <Text style={styles.barCount}>{n}</Text>
              </View>
            );
          })}
          <Text style={styles.small}>{trial.song.title} — {trial.song.artist} · Lượt sau: {shownReveal.nextDifficulty}</Text>
        </View>
      )}

      {blind.leaderboard.length > 0 && (
        <View style={{ marginTop: space.xl }}>
          <Text style={[type.title3, { color: colors.text, marginBottom: space.sm }]}>Bảng điểm</Text>
          {blind.leaderboard.map((r, i) => (
            <View key={r.userId} style={[styles.scoreRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.scoreRank, { color: i < 3 ? colors.accent : colors.textSecondary }]}>{i + 1}</Text>
              <Text style={[type.body, { color: colors.text, flex: 1, fontWeight: r.userId === user?._id ? '700' : '400' }]} numberOfLines={1}>
                {r.name}{r.userId === user?._id ? ' (bạn)' : ''}
              </Text>
              <Text style={[type.subhead, { color: colors.textSecondary }]}>{r.correct}/{r.total} đúng</Text>
            </View>
          ))}
        </View>
      )}
    </ChromeScrollView>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: c.text, fontWeight: '800', letterSpacing: -0.5 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' },
  meta: { color: c.textSecondary, fontSize: 13 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  leave: { marginLeft: 'auto' },
  chipText: { color: c.text, fontSize: 12, fontWeight: '700' },
  steps: { flexDirection: 'row', gap: 6, marginTop: 20 },
  step: { flex: 1, gap: 6 },
  stepTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  stepFill: { height: 4 },
  stepText: { color: c.textSecondary, fontSize: 12, textAlign: 'center' },
  headlineRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 20 },
  headline: { color: c.text, fontSize: 22, fontWeight: '700', flex: 1 },
  countdown: { color: c.textSecondary, fontSize: 18, fontVariant: ['tabular-nums'] },
  tiles: { flexDirection: 'row', gap: 12, marginTop: 16 },
  tile: { flex: 1, aspectRatio: 1, borderRadius: radius.xl, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 6, overflow: 'hidden', backgroundColor: c.surface },
  tileLetter: { color: c.text, fontSize: 64, fontWeight: '800' },
  playingText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  tileReveal: { fontSize: 16, fontWeight: '800' },
  replay: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, marginTop: 4 },
  replayText: { fontSize: 13, fontWeight: '700' },
  voteRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  voteBtn: { flex: 1, minHeight: 52, borderRadius: radius.lg, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  voteText: { color: c.text, fontWeight: '700', textAlign: 'center', fontSize: 14 },
  small: { color: c.textSecondary, fontSize: 12, marginTop: 10, lineHeight: 17 },
  error: { color: '#FF453A', marginTop: 10 },
  result: { marginTop: 18, padding: 16, borderRadius: radius.lg, gap: 10 },
  resultTitle: { color: c.text, fontSize: 15, fontWeight: '700' },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  barLabel: { color: c.textSecondary, width: 110, fontSize: 13 },
  barTrack: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8 },
  barCount: { color: c.text, width: 24, textAlign: 'right', fontVariant: ['tabular-nums'] },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  scoreRank: { width: 22, fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'] },
});
