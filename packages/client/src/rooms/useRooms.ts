import { create } from 'zustand';
import { Alert } from 'react-native';
import { getSocket } from '../api/socket';
import { api, playbackUrlFor, streamUrl } from '../api/api';
import { audioEngine } from '../audio/audioEngine';
import { useStore, liveRoomHooks, Song } from '../store/useStore';
import { serverNow, syncClock } from './serverClock';
import { startAligned, alignTo, releaseRate, SYNC } from '../audio/timelineSync';

// The machine side of the shared listening room (apps/server/src/modules/rooms/). Server keeps pace; pointing machine:
// - Radio: broadcast at correct location = server time − startedAt, and periodically measure/correct deviation.
// - Blind listening: play A and then B according to server schedule, listen again when voting and sending votes.

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
  // Deviation between actual transmit position and radio clock — measurement of synchronization technique.
  blind: {
    room: { id: string; name: string; tagline?: string; colors: [string, string] };
    trial: Trial | null; listenerCount: number; leaderboard: ScoreRow[];
  } | null;
  votesIn: { voted: number; listeners: number } | null; // How many people chose (no choice revealed)
  myVote: Choice | null;
  reveal: Reveal | null;
  playingSide: 'A' | 'B' | null;
  error: string | null;
};

export const useRooms = create<RoomsState>(() => ({
  station: null, blind: null, votesIn: null, myVote: null, reveal: null, playingSide: null, error: null,
}));

// Follow the station's timeline: utils/audio/timelineSync.ts (slight speed change / fast forward at the same cost).
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

// ---------------- Radio 24/7 ----------------

let driftTimer: ReturnType<typeof setInterval> | null = null;

const stationPosition = (now: NonNullable<StationState['now']>) => (serverNow() - now.startedAt) / 1000;
const inStation = (id?: string) => {
  const room = useStore.getState().liveRoom;
  return room?.kind === 'station' && (!id || room.id === id);
};

// Stick to the station's timeline (utils/audio/timelineSync.ts). Loading/buffering, stationary position —
// At that time, you will think it is misleading and unfair, so ignore it.
async function correctDrift() {
  const now = useRooms.getState().station?.now;
  const store = useStore.getState();
  if (!now || !inStation() || !store.isPlaying || store.isBuffering || store.currentSong?._id !== now.song._id) return;
  await alignTo(() => stationPosition(now));
}

// Play the correct song and the correct station. `resume`: the listener just pressed playback.
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
  // New posts are announced a few seconds in advance (LEAD_MS on the server): wait until the time and then all machines will join.
  const wait = now.startedAt - serverNow();
  if (wait > 0) await sleep(wait);
  if (useRooms.getState().station?.now?.song._id !== now.song._id || !inStation()) return;
  // Enter the machine exactly as long as needed to ask for tokens + load cards, and when there is a sound, the station will match.
  await startAligned(() => stationPosition(now), (pos) => store.playSong(now.song, [now.song], pos));
  await correctDrift(); // remaining deviation: slight speed adjustment
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

// ---------------- Blind listening room ----------------
// Fast: when preparing, the machine loads A into the active deck AND preloads B into the standby deck (utils/audioEngine),
// both have fast forwarded to the beginning of the excerpt. At this point, B just needs to change decks (crossfade 0 ms) — don't load anything.

let playSeq = 0;        // Each time a segment is played, it increases; If the old part sees a different number, it stops automatically
let trialUrls: { A: string; B: string } | null = null;

const inBlind = () => useStore.getState().liveRoom?.kind === 'blind';
const blindTrialId = () => useRooms.getState().blind?.trial?.id;

function urlFor(song: Song, c: Condition, tokens: { fileToken: string | null; hlsToken: string | null }) {
  if (c.key === 'original') return playbackUrlFor(song, 'original', tokens) || streamUrl(song._id, tokens.fileToken);
  return playbackUrlFor(song, c.key, tokens);
}

// Play one side in frame [at, at + excerptSeconds] (server time). `ready`: this side is already there
// on deck (A loaded, B preloaded) — just play/swap deck; If not, then load it (listen again, go in the middle).
async function playWindow(side: 'A' | 'B', at: number, ready: boolean) {
  const trial = useRooms.getState().blind?.trial;
  const url = trialUrls?.[side];
  if (!trial || !url) return;
  const mine = ++playSeq;
  if (!ready) await audioEngine.load(url, false, { startAt: trial.excerptStart });
  if (mine !== playSeq) return;
  await sleep(at - serverNow());
  const late = Math.max(0, (serverNow() - at) / 1000); // entered the room midway/computer was slow
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
    // Load A and then pre-load B while preparing. Must be sequential: load() unloads the waiting deck, running in parallel will
    // delete B just loaded.
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
  // Stop listening music: room shares player to play A/B clips.
  await audioEngine.unload().catch(() => {});
  useStore.setState({ currentSong: null, isPlaying: false, queue: [], liveRoom: { kind: 'blind', id, name } });
  const snapshot = await emitAck('blind:join', { id });
  useRooms.setState({ blind: snapshot, votesIn: null, myVote: null, reveal: null, error: null });
  if (snapshot.trial) runTrial(snapshot.trial).catch(() => {});
}

// Listen to one side again while choosing.
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
  playSeq += 1; // Announce → stop all currently listening passages
  audioEngine.pause().catch(() => {});
  useRooms.setState({ reveal, playingSide: null, blind: { ...blind, leaderboard: reveal.leaderboard } });
});
getSocket().on('blind:votes', ({ trialId, voted, listeners }: { trialId: string; voted: number; listeners: number }) => {
  if (inBlind() && blindTrialId() === trialId) useRooms.setState({ votesIn: { voted, listeners } });
});
// Everyone has selected → server closes votes early: updates the time stamp of the turn.
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

// Clear the room status on the device (timer, currently playing section) — do not notify the server.
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

// Reconnect (drop network, server restarts) then re-enter the room you are in.
getSocket().on('connect', () => {
  const room = useStore.getState().liveRoom;
  if (!room) return;
  const rejoin = room.kind === 'station' ? joinStation : joinBlindRoom;
  resetLocal();
  useStore.setState({ liveRoom: null }); // The old room on the server has been lost due to the old connection
  rejoin(room.id, room.name).catch(() => useRooms.setState({ station: null, blind: null }));
});
