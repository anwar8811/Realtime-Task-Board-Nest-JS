/**
 * Socket.io-client factory for the tasks realtime channel (STORY-009).
 *
 * This is a pure factory function, NOT a singleton, and is NOT invoked at
 * module load time — it must stay side-effect-free on import so it's safe
 * to import from a server-rendered module without opening a connection
 * during SSR. `useTaskSocket` is the only caller, and it decides exactly
 * when to construct (and `.connect()`) a socket, keyed off the current
 * auth token.
 */
import { io, Socket } from 'socket.io-client';
import { API_BASE_URL } from './api';

export function createTaskSocket(token: string): Socket {
  return io(API_BASE_URL, {
    // Bare token, no "Bearer " prefix — matches what the gateway reads from
    // `client.handshake.auth.token` (see backend/src/tasks/tasks.gateway.ts).
    auth: { token },
    // Caller (useTaskSocket) controls exactly when the connection opens, so
    // listeners can be attached first and never miss the first `connect`.
    autoConnect: false,
  });
}
