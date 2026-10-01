import { Platform } from 'react-native';
import { audioEngine } from './audioEngine';
import { controlStep, newSyncCtl } from 'hugo-stream';

export { SYNC } from 'hugo-stream';

// Keep this machine on ONE general timeline (where it should be, in server time) — use
// for 24/7 radio (src/rooms/useRooms.ts) and sync multiple devices with the same account (store/useStore.ts).
//
// Each SYNC.PERIOD_MS measures the offset and then asks the controller (controlStep of hugo-stream — simulated: from 4th second,
// ie at the end of the first HLS segment, the difference between the machines is < 20 ms) how much should I rewind or adjust the speed?

const sleep = (ms: number) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

// "Music input cost" of this OWN device: from the time the play/rewind command is given until the sound actually plays (ask for token,
// load HLS segment, AVPlayer/ExoPlayer buffer...). Web a few hundred ms, phone via mobile network sometimes
// 1–3 s. Learn gradually after each play/rewind (moving average) and then go UP by that amount, until the sound
// Take it up and it will match.
let catchUpS = Platform.OS === 'web' ? 0.4 : 1.2;
let busy = false;
const ctl = newSyncCtl();
let rateTouched = false; // changed the playback speed → remember to return it to 1 when you stop clinging

async function learnCatchUp(target: number, issuedAt: number) {
  const deadline = issuedAt + 10000;
  while (Date.now() < deadline) {
    await sleep(100);
    const p = await audioEngine.getPosition();
    // Position has passed the target point ⇒ sound starts at (now − interval played).
    if (p !== null && p > target + 0.15 && p < target + 3) {
      const cost = (Date.now() - issuedAt) / 1000 - (p - target);
      if (cost > 0 && cost < 8) catchUpS = catchUpS * 0.6 + cost * 0.4;
      return;
    }
  }
}

// Start playing so that the sound starts at the correct time `expected()`: `start(pos)` loads/rewinds and then plays at `pos`.
export async function startAligned(expected: () => number, start: (pos: number) => Promise<unknown>) {
  busy = true;
  ctl.filtered = null; // New article/point: old measurements are no longer meaningful
  try {
    const issuedAt = Date.now();
    const target = Math.max(0, expected() + catchUpS);
    await start(target);
    await learnCatchUp(target, issuedAt);
  } finally {
    busy = false;
  }
}

// Measure deviation from `expected()` then correct (fast forward or change speed). Returns the measured deviation (seconds, > 0 is
// this machine goes first), null if it is not measured at this time. Call every SYNC.PERIOD_MS.
export async function alignTo(expected: () => number): Promise<number | null> {
  if (busy) return null;
  const actual = await audioEngine.getPosition();
  if (actual === null) return null;
  const drift = actual - expected();
  const action = controlStep(ctl, drift);
  if (action.seek) {
    await releaseRate();
    await startAligned(expected, (pos) => audioEngine.seek(pos));
  } else {
    rateTouched = action.rate !== 1;
    await audioEngine.setRate(action.rate);
  }
  return drift;
}

// Stop sticking to the timeline (stop, leave the room, turn off sync): playback at original speed.
export async function releaseRate() {
  ctl.filtered = null;
  if (!rateTouched) return;
  rateTouched = false;
  await audioEngine.setRate(1);
}
