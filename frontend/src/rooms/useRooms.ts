import { create } from 'zustand';
import { Alert } from 'react-native';
import { getSocket } from '../utils/socket';
import { api, playbackUrlFor, streamUrl } from '../utils/api';
import { audioEngine } from '../utils/audioEngine';
import { useStore, liveRoomHooks, Song } from '../store/useStore';
import { serverNow, syncClock } from './serverClock';
import { startAligned, alignTo, releaseRate, SYNC } from '../utils/audio/timelineSync';

// Phía máy của phòng nghe chung (backend/rooms/). Server giữ nhịp; máy chỉ:
//  - Đài: phát đúng vị trí = giờ server − startedAt, và định kỳ đo/sửa độ lệch.
//  - Nghe mù: phát A rồi B đúng lịch server, cho nghe lại lúc bỏ phiếu, gửi phiếu.

export type StationEntry = {
  id: string; song: Song; addedBy: string; addedByName: string; votes: number; voters: string[];
};
export type StationState = {
  station: { id: string; name: string; tagline?: string; colors: [string, string]; allowRequests: boolean };
  now: { song: Song & { duration: number }; startedAt: number } | null;
  queue: StationEntry[];
  listeners: { userId: string; name: string }[];
};
export type Condition = { key: string; kbps: number | null };
export type Trial = {
  id: string; no: number; song: Song & { duration: number }; a: Condition; b: Condition;
  excerptStart: number; excerptSeconds: number; difficulty: string;
  aAt: number; bAt: number; voteFrom: number; voteUntil: number; revealUntil: number;
};
export type ScoreRow = { userId: string; name: string; correct: number; total: number };
export type Reveal = {
  trialId: string; a: Condition; b: Condition; control: boolean; tally: { A: number; B: number; same: number };
  correct: Record<string, boolean>; leaderboard: ScoreRow[]; nextDifficulty: string;
};
export type Choice = 'A' | 'B' | 'same';

type RoomsState = {
  station: StationState | null;
  // Độ lệch giữa vị trí phát thật và đồng hồ đài — số đo của kỹ thuật đồng bộ.
  blind: {
    room: { id: string; name: string; tagline?: string; colors: [string, string] };
    trial: Trial | null; listenerCount: number; leaderboard: ScoreRow[];
  } | null;
  votesIn: { voted: number; listeners: number } | null; // bao nhiêu người đã chọn (không lộ chọn gì)
  myVote: Choice | null;
  reveal: Reveal | null;
  playingSide: 'A' | 'B' | null;
  error: string | null;
};

export const useRooms = create<RoomsState>(() => ({
  station: null, blind: null, votesIn: null, myVote: null, reveal: null, playingSide: null, error: null,
}));

// Bám dòng thời gian của đài: utils/audio/timelineSync.ts (đổi tốc độ nhẹ / tua vượt đúng chi phí nạp).
const sleep = (ms: number) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

function emitAck<T = any>(event: string, payload: object): Promise<T> {
  return new Promise((resolve, reject) => {
    getSocket().timeout(8000).emit(event, payload, (err: unknown, res: any) => {
      if (err) reject(new Error('Máy chủ không phản hồi'));
      else if (res?.error) reject(new Error(res.error));
      else resolve(res);
    });
  });
}

// ---------------- Đài 24/7 ----------------

let driftTimer: ReturnType<typeof setInterval> | null = null;

const stationPosition = (now: NonNullable<StationState['now']>) => (serverNow() - now.startedAt) / 1000;
const inStation = (id?: string) => {
  const room = useStore.getState().liveRoom;
  return room?.kind === 'station' && (!id || room.id === id);
};

// Bám dòng thời gian của đài (utils/audio/timelineSync.ts). Đang nạp/đệm thì vị trí đứng yên —
// đo lúc đó sẽ tưởng lệch và tua oan, nên bỏ qua.
async function correctDrift() {
  const now = useRooms.getState().station?.now;
  const store = useStore.getState();
  if (!now || !inStation() || !store.isPlaying || store.isBuffering || store.currentSong?._id !== now.song._id) return;
  await alignTo(() => stationPosition(now));
}

// Phát đúng bài và đúng vị trí đài đang phát. `resume`: người nghe vừa bấm phát lại.
async function applyStation(resume = false) {
  const st = useRooms.getState().station;
  const now = st?.now;
  if (!now || !inStation(st.station.id)) return;
  const store = useStore.getState();
  if (store.currentSong?._id === now.song._id && audioEngine.hasSound()) {
    if (resume) {
      useStore.setState({ isPlaying: true });
      await startAligned(() => stationPosition(now), async (pos) => {
        await audioEngine.seek(pos);
        await audioEngine.play();
      });
    }
    return;
  }
  // Bài mới được báo trước vài giây (LEAD_MS ở server): chờ tới giờ rồi mọi máy cùng vào.
  const wait = now.startedAt - serverNow();
  if (wait > 0) await sleep(wait);
  if (useRooms.getState().station?.now?.song._id !== now.song._id || !inStation()) return;
  // Vào trước đúng chừng máy này cần để xin token + nạp bài, lúc có tiếng là khớp đài.
  await startAligned(() => stationPosition(now), (pos) => store.playSong(now.song, [now.song], pos));
  await correctDrift(); // phần lệch còn lại: chỉnh tốc độ nhẹ
}

export async function joinStation(id: string, name: string) {
  await leaveRoom();
  await syncClock();
  const snapshot = await emitAck<StationState>('station:join', { id });
  useRooms.setState({ station: snapshot, error: null });
  useStore.setState({ liveRoom: { kind: 'station', id, name } });
  liveRoomHooks.resume = () => { applyStation(true).catch(() => {}); };
  driftTimer = setInterval(() => { correctDrift().catch(() => {}); }, SYNC.PERIOD_MS);
  await applyStation();
}

export const suggestSong = (songId: string) =>
  emitAck('station:suggest', { id: useRooms.getState().station?.station.id, songId });
export const voteEntry = (entryId: string) =>
  emitAck('station:vote', { id: useRooms.getState().station?.station.id, entryId });
export const removeEntry = (entryId: string) =>
  emitAck('station:remove', { id: useRooms.getState().station?.station.id, entryId });

getSocket().on('station:state', (st: StationState) => {
  if (!inStation(st.station.id)) return;
  const prevSong = useRooms.getState().station?.now?.song._id;
  useRooms.setState({ station: st });
  if (st.now && st.now.song._id !== prevSong) applyStation().catch(() => {});
});

// ---------------- Phòng nghe mù ----------------
// Nhanh: lúc chuẩn bị, máy nạp A vào deck đang dùng VÀ nạp sẵn B vào deck chờ (utils/audioEngine),
// cả hai đã tua tới đầu đoạn trích. Tới giờ B chỉ việc đổi deck (crossfade 0 ms) — không nạp gì cả.

let playSeq = 0;        // mỗi lần phát một đoạn tăng lên; đoạn cũ thấy số khác thì tự dừng
let trialUrls: { A: string; B: string } | null = null;

const inBlind = () => useStore.getState().liveRoom?.kind === 'blind';
const blindTrialId = () => useRooms.getState().blind?.trial?.id;

function urlFor(song: Song, c: Condition, tokens: { fileToken: string | null; hlsToken: string | null }) {
  if (c.key === 'original') return playbackUrlFor(song, 'original', tokens) || streamUrl(song._id, tokens.fileToken);
  return playbackUrlFor(song, c.key, tokens);
}

// Phát một phía trong khung [at, at + excerptSeconds] (giờ server). `ready`: phía này đã nằm sẵn
// trên deck (A đã nạp, B đã nạp sẵn) — chỉ cần phát/đổi deck; không thì nạp (nghe lại, vào giữa chừng).
async function playWindow(side: 'A' | 'B', at: number, ready: boolean) {
  const trial = useRooms.getState().blind?.trial;
  const url = trialUrls?.[side];
  if (!trial || !url) return;
  const mine = ++playSeq;
  if (!ready) await audioEngine.load(url, false, { startAt: trial.excerptStart });
  if (mine !== playSeq) return;
  await sleep(at - serverNow());
  const late = Math.max(0, (serverNow() - at) / 1000); // vào phòng giữa chừng / máy chậm
  if (mine !== playSeq || late >= trial.excerptSeconds) return;
  if (side === 'B' && ready) await audioEngine.crossfade(0);
  if (late > 0.15) await audioEngine.seek(trial.excerptStart + late);
  await audioEngine.play();
  useRooms.setState({ playingSide: side });
  await sleep((trial.excerptSeconds - late) * 1000);
  if (mine !== playSeq) return;
  await audioEngine.pause();
  useRooms.setState({ playingSide: null });
}

async function runTrial(trial: Trial) {
  playSeq += 1;
  audioEngine.pause().catch(() => {});
  useRooms.setState({ myVote: null, reveal: null, playingSide: null, votesIn: null, error: null });
  try {
    const tokens = await api.getPlaybackToken(trial.song._id);
    trialUrls = { A: urlFor(trial.song, trial.a, tokens)!, B: urlFor(trial.song, trial.b, tokens)! };
    // Nạp A rồi nạp sẵn B trong lúc chuẩn bị. Phải tuần tự: load() dỡ deck chờ, chạy song song sẽ
    // xoá mất B vừa nạp.
    await audioEngine.load(trialUrls.A, false, { startAt: trial.excerptStart });
    await audioEngine.preload(trialUrls.B, `${trial.id}:B`, { startAt: trial.excerptStart });
  } catch (e: any) {
    useRooms.setState({ error: e.message });
    return;
  }
  if (blindTrialId() !== trial.id) return;
  await playWindow('A', trial.aAt, true);
  if (blindTrialId() === trial.id) await playWindow('B', trial.bAt, audioEngine.preloadedKey() === `${trial.id}:B`);
}

export async function joinBlindRoom(id: string, name: string) {
  await leaveRoom();
  await syncClock();
  // Dừng nhạc đang nghe: phòng dùng chung trình phát để phát các đoạn A/B.
  await audioEngine.unload().catch(() => {});
  useStore.setState({ currentSong: null, isPlaying: false, queue: [], liveRoom: { kind: 'blind', id, name } });
  const snapshot = await emitAck('blind:join', { id });
  useRooms.setState({ blind: snapshot, votesIn: null, myVote: null, reveal: null, error: null });
  if (snapshot.trial) runTrial(snapshot.trial).catch(() => {});
}

// Nghe lại một phía trong lúc chọn.
export function replaySide(side: 'A' | 'B') {
  playWindow(side, serverNow(), false).catch(() => {});
}

export async function castVote(choice: Choice) {
  const blind = useRooms.getState().blind;
  if (!blind?.trial) return;
  await emitAck('blind:vote', { id: blind.room.id, trialId: blind.trial.id, choice });
  useRooms.setState({ myVote: choice });
}

getSocket().on('blind:trial', (trial: Trial) => {
  const blind = useRooms.getState().blind;
  if (!inBlind() || !blind) return;
  useRooms.setState({ blind: { ...blind, trial } });
  runTrial(trial).catch(() => {});
});
getSocket().on('blind:reveal', (reveal: Reveal) => {
  const blind = useRooms.getState().blind;
  if (!inBlind() || !blind) return;
  playSeq += 1; // công bố → dừng mọi đoạn đang nghe lại
  audioEngine.pause().catch(() => {});
  useRooms.setState({ reveal, playingSide: null, blind: { ...blind, leaderboard: reveal.leaderboard } });
});
getSocket().on('blind:votes', ({ trialId, voted, listeners }: { trialId: string; voted: number; listeners: number }) => {
  if (inBlind() && blindTrialId() === trialId) useRooms.setState({ votesIn: { voted, listeners } });
});
// Mọi người đã chọn → server đóng phiếu sớm: cập nhật mốc giờ của lượt.
getSocket().on('blind:closing', ({ trialId, voteUntil, revealUntil }: { trialId: string; voteUntil: number; revealUntil: number }) => {
  const blind = useRooms.getState().blind;
  if (!inBlind() || !blind?.trial || blind.trial.id !== trialId) return;
  useRooms.setState({ blind: { ...blind, trial: { ...blind.trial, voteUntil, revealUntil } } });
});
getSocket().on('blind:listeners', ({ count }: { count: number }) => {
  const blind = useRooms.getState().blind;
  if (inBlind() && blind) useRooms.setState({ blind: { ...blind, listenerCount: count } });
});
getSocket().on('blind:error', ({ message }: { message: string }) => {
  if (inBlind()) useRooms.setState({ error: message });
});

// ---------------- Chung ----------------

// Dọn trạng thái phòng trên máy (hẹn giờ, đoạn đang phát) — không báo server.
function resetLocal() {
  if (driftTimer) clearInterval(driftTimer);
  driftTimer = null;
  playSeq += 1;
  liveRoomHooks.resume = undefined;
  releaseRate().catch(() => {});
}

export async function leaveRoom() {
  if (!useStore.getState().liveRoom) return;
  getSocket().emit('room:leave');
  resetLocal();
  await audioEngine.pause().catch(() => {});
  useStore.setState({ liveRoom: null, isPlaying: false });
  useRooms.setState({ station: null, blind: null, votesIn: null, myVote: null, reveal: null, playingSide: null, error: null });
}

getSocket().on('room:closed', () => {
  if (!useStore.getState().liveRoom) return;
  Alert.alert('Nghe cùng nhau', 'Phòng đã tạm dừng');
  leaveRoom();
});

// Kết nối lại (rớt mạng, server khởi động lại) thì vào lại phòng đang ở.
getSocket().on('connect', () => {
  const room = useStore.getState().liveRoom;
  if (!room) return;
  const rejoin = room.kind === 'station' ? joinStation : joinBlindRoom;
  resetLocal();
  useStore.setState({ liveRoom: null }); // phòng cũ trên server đã mất theo kết nối cũ
  rejoin(room.id, room.name).catch(() => useRooms.setState({ station: null, blind: null }));
});
