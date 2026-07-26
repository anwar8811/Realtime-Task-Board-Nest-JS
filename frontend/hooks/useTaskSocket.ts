'use client';

import { useEffect, useRef } from 'react';
import type { Socket } from 'socket.io-client';
import { createTaskSocket } from '@/lib/socket';
import type { Task } from './useTasks';

/**
 * Owns ONLY the Socket.io connection lifecycle + event subscription for the
 * realtime tasks channel (STORY-009) — it holds no task list state itself.
 * `useTasks` is the single source of truth for the rendered list; this hook
 * only dispatches into it via the callbacks passed in.
 *
 * Returns void: there is no connection-status UI/indicator anywhere in this
 * app (architect ruling R-009-5) — socket errors are swallowed with, at
 * most, a dev-only console.warn.
 */
export function useTaskSocket(
  token: string | null,
  onTaskCreated: (task: Task) => void,
  onTaskUpdated: (task: Task) => void,
  onTaskDeleted: (id: string) => void,
  onReconnect: () => void,
): void {
  // Callback refs so the effect below doesn't need onTaskCreated/etc (or
  // onReconnect) in its dependency array — the effect is keyed ONLY on
  // `token`, and the ref is always read fresh inside each listener, so a
  // caller re-creating these callbacks every render never tears down and
  // re-opens the socket connection.
  const onTaskCreatedRef = useRef(onTaskCreated);
  const onTaskUpdatedRef = useRef(onTaskUpdated);
  const onTaskDeletedRef = useRef(onTaskDeleted);
  const onReconnectRef = useRef(onReconnect);

  useEffect(() => {
    onTaskCreatedRef.current = onTaskCreated;
    onTaskUpdatedRef.current = onTaskUpdated;
    onTaskDeletedRef.current = onTaskDeleted;
    onReconnectRef.current = onReconnect;
  });

  useEffect(() => {
    if (!token) return;

    const socket: Socket = createTaskSocket(token);

    // Guards AC4: the FIRST `connect` (the initial connection) must NOT
    // trigger a reconcile refetch — only genuine reconnects (i.e. every
    // `connect` after that first one) should. Listening on the socket-level
    // `connect` event (rather than `socket.io.on('reconnect')`) is
    // deliberate per architect ruling — it fires after the namespace
    // connect is acked, which orders it correctly relative to the gateway's
    // room-join on the server side.
    let hasConnectedBefore = false;

    function handleConnect() {
      if (hasConnectedBefore) {
        onReconnectRef.current();
      }
      hasConnectedBefore = true;
    }

    function handleTaskCreated(task: Task) {
      onTaskCreatedRef.current(task);
    }

    function handleTaskUpdated(task: Task) {
      onTaskUpdatedRef.current(task);
    }

    function handleTaskDeleted({ id }: { id: string }) {
      onTaskDeletedRef.current(id);
    }

    function handleConnectError(err: Error) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('Task socket connect_error:', err.message);
      }
    }

    socket.on('connect', handleConnect);
    socket.on('task.created', handleTaskCreated);
    socket.on('task.updated', handleTaskUpdated);
    socket.on('task.deleted', handleTaskDeleted);
    socket.on('connect_error', handleConnectError);

    socket.connect();

    // Thorough cleanup: React 19 StrictMode double-invokes effects in dev,
    // so an incomplete cleanup (e.g. forgetting one listener, or relying on
    // `disconnect()` alone to drop listeners) would cause duplicated events
    // on the second mount.
    return () => {
      socket.off('connect', handleConnect);
      socket.off('task.created', handleTaskCreated);
      socket.off('task.updated', handleTaskUpdated);
      socket.off('task.deleted', handleTaskDeleted);
      socket.off('connect_error', handleConnectError);
      socket.disconnect();
    };
  }, [token]);
}
