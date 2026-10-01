import { io, Socket } from 'socket.io-client';
import { API_BASE_URL, getAuthToken } from './api';

// Single shared connection, created on first import (the store wires party-sync
// listeners at module load so it can receive an invite/broadcast at any time).
let socket: Socket | null = null;

export const getSocket = (): Socket => {
  if (!socket) {
    // `auth` as a callback is re-read on every (re)connect, so the server always sees
    // the current session — it only trusts host/workspace actions from a verified user.
    socket = io(API_BASE_URL, { transports: ['websocket'], auth: (cb) => cb({ token: getAuthToken() }) });
  }
  return socket;
};

// The handshake is the only place the server reads the token, so a login/logout needs
// a fresh connection. The store's 'connect' listener rejoins rooms afterwards.
export const reauthSocket = () => {
  getSocket().disconnect().connect();
};
