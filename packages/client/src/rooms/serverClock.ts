import { createServerClock } from 'hugo-stream';
import { getSocket } from '../api/socket';

// Server time over the socket (lowest-RTT ping wins — createServerClock of hugo-stream).
const clock = createServerClock(() => new Promise<number | null>((resolve) =>
  getSocket().timeout(3000).emit('clock:ping', (err: unknown, t: number) => resolve(err ? null : t)),
));

export const serverNow = clock.now;
export const syncClock = clock.sync;
