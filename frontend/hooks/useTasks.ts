'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useTaskSocket } from './useTaskSocket';

/**
 * The frontend's own copy of the Task shape, matching what the backend
 * returns from GET /tasks. No shared types package exists between
 * frontend/backend (see folder-structure.md) — this file is the single
 * place the frontend's Task type lives, and STORY-007/009 should import
 * it from here rather than redeclaring it.
 */
export type TaskStatus = 'todo' | 'in_progress' | 'done';

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

interface UseTasksResult {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
  status: TaskStatus | undefined;
  setStatus: (status: TaskStatus | undefined) => void;
}

type TaskEvent =
  | { type: 'upsert'; task: Task }
  | { type: 'delete'; id: string };

/**
 * Pure merge function (STORY-009) — no side effects, no socket/React
 * dependencies, so it's trivially unit-testable in isolation. Used to fold
 * both `task.created` and `task.updated` (identical merge semantics, both
 * passed as `{ type: 'upsert' }`) and `task.deleted` into the list state
 * `useTasks` owns, respecting the currently active status filter.
 *
 * Upsert:
 *  - If `status` is undefined (no filter/"All") OR the task's status matches
 *    the active filter: replace the task in place (same index) if its id is
 *    already present, otherwise append it to the end. No re-sorting.
 *  - Otherwise (task's status no longer matches the active filter): remove
 *    it by id if present (no-op if it wasn't there) — this is what makes a
 *    task.updated that transitions OUT of view disappear live, and also
 *    correctly handles a task.updated transitioning INTO view (added, not
 *    skipped, even if it wasn't previously visible).
 *
 * Delete: remove by id if present; no-op otherwise.
 */
export function mergeTaskEvent(
  tasks: Task[],
  status: TaskStatus | undefined,
  event: TaskEvent,
): Task[] {
  if (event.type === 'delete') {
    return tasks.filter((t) => t.id !== event.id);
  }

  const { task } = event;
  const matchesFilter = status === undefined || task.status === status;
  const existingIndex = tasks.findIndex((t) => t.id === task.id);

  if (!matchesFilter) {
    if (existingIndex === -1) return tasks;
    return tasks.filter((t) => t.id !== task.id);
  }

  if (existingIndex === -1) {
    return [...tasks, task];
  }

  const next = [...tasks];
  next[existingIndex] = task;
  return next;
}

/**
 * Single source of truth for the rendered task list (see folder-structure.md
 * conventions). Owns the status filter itself (architect ruling) and fetches
 * GET /tasks[?status=] via the shared apiFetch wrapper. STORY-009's
 * useTaskSocket will dispatch into this hook's state rather than keeping a
 * second, parallel list — so `refetch` is kept as a stable useCallback
 * reference other effects can safely depend on.
 */
export function useTasks(initialStatus?: TaskStatus): UseTasksResult {
  const { token } = useAuth();
  const [status, setStatus] = useState<TaskStatus | undefined>(initialStatus);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Read via a ref rather than depending on `status` in the socket callbacks
  // below, so the merge always uses the CURRENT active filter and never a
  // stale one captured at socket-connect time. Updated in an effect (not
  // during render) per the rules of hooks.
  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // Monotonically increasing request id. Guards against an in-flight
  // request's response overwriting a newer one when the filter is toggled
  // quickly (e.g. todo -> done fires two requests; if "todo"'s response
  // arrives after "done"'s, it must be discarded).
  const requestIdRef = useRef(0);

  const fetchTasks = useCallback(() => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    const path = status ? `/tasks?status=${status}` : '/tasks';

    apiFetch(path)
      .then(async (response) => {
        if (requestId !== requestIdRef.current) return; // stale, ignore

        if (!response.ok) {
          let message = 'Failed to load tasks';
          try {
            const body: { message?: string } = await response.json();
            if (typeof body.message === 'string') {
              message = body.message;
            }
          } catch {
            // keep generic message
          }
          setTasks([]);
          setError(message);
          return;
        }

        const data: Task[] = await response.json();
        setTasks(data);
      })
      .catch(() => {
        if (requestId !== requestIdRef.current) return;
        setTasks([]);
        setError('Failed to load tasks');
      })
      .finally(() => {
        if (requestId !== requestIdRef.current) return;
        setLoading(false);
      });
  }, [status]);

  useEffect(() => {
    // Re-fetch whenever `status` changes (fetchTasks is recreated when it
    // does). This is the "synchronize with an external system" case
    // useEffect exists for — GET /tasks is fetched fresh whenever the
    // status filter changes — same justification as the localStorage read
    // in lib/auth-context.tsx. The linter can't see that setLoading/setError
    // inside fetchTasks are conditioned on a fresh request id, so it flags
    // this as a plain synchronous setState-in-effect; it isn't one.
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    fetchTasks();
  }, [fetchTasks]);

  // STORY-009: useTaskSocket owns connection lifecycle only; these callbacks
  // are its dispatch target into this hook's own `tasks` state — the single
  // source of truth for the rendered list. `statusRef` (not `status`) is
  // read inside each callback so a merge always applies the CURRENT active
  // filter, never one captured when the socket first connected.
  const onTaskCreated = useCallback((task: Task) => {
    setTasks((prev) =>
      mergeTaskEvent(prev, statusRef.current, { type: 'upsert', task }),
    );
  }, []);

  const onTaskUpdated = useCallback((task: Task) => {
    setTasks((prev) =>
      mergeTaskEvent(prev, statusRef.current, { type: 'upsert', task }),
    );
  }, []);

  const onTaskDeleted = useCallback((id: string) => {
    setTasks((prev) =>
      mergeTaskEvent(prev, statusRef.current, { type: 'delete', id }),
    );
  }, []);

  // AC4: re-fetch the list once per genuine reconnect to reconcile any
  // events missed while disconnected.
  useTaskSocket(token, onTaskCreated, onTaskUpdated, onTaskDeleted, fetchTasks);

  return { tasks, loading, error, refetch: fetchTasks, status, setStatus };
}
