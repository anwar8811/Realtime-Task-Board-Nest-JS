import { mergeTaskEvent } from './useTasks';
import type { Task } from './useTasks';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    title: 'Task',
    description: null,
    status: 'todo',
    ownerId: 'owner-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('mergeTaskEvent', () => {
  it('upsert (created) matching filter, id not in list -> appended to the end', () => {
    const existing = makeTask({ id: 'a', status: 'todo' });
    const created = makeTask({ id: 'b', status: 'todo' });

    const result = mergeTaskEvent([existing], 'todo', {
      type: 'upsert',
      task: created,
    });

    expect(result).toEqual([existing, created]);
  });

  it('upsert (created) NOT matching filter -> not added (list unchanged)', () => {
    const existing = makeTask({ id: 'a', status: 'todo' });
    const created = makeTask({ id: 'b', status: 'done' });

    const result = mergeTaskEvent([existing], 'todo', {
      type: 'upsert',
      task: created,
    });

    expect(result).toEqual([existing]);
  });

  it('upsert (updated) for an id already in list, still matches filter -> replaced in place at the same index', () => {
    const a = makeTask({ id: 'a', status: 'todo', title: 'Old A' });
    const b = makeTask({ id: 'b', status: 'todo', title: 'B' });
    const updatedA = makeTask({ id: 'a', status: 'todo', title: 'New A' });

    const result = mergeTaskEvent([a, b], 'todo', {
      type: 'upsert',
      task: updatedA,
    });

    expect(result).toEqual([updatedA, b]);
    expect(result).toHaveLength(2);
  });

  it('upsert (updated) for an id in the list whose new status no longer matches the filter -> removed', () => {
    const a = makeTask({ id: 'a', status: 'todo' });
    const b = makeTask({ id: 'b', status: 'todo' });
    const updatedA = makeTask({ id: 'a', status: 'done' });

    const result = mergeTaskEvent([a, b], 'todo', {
      type: 'upsert',
      task: updatedA,
    });

    expect(result).toEqual([b]);
  });

  it('upsert (updated) for an id NOT currently in the list, whose status now matches the filter -> added', () => {
    const b = makeTask({ id: 'b', status: 'todo' });
    const transitionedIn = makeTask({ id: 'c', status: 'todo' });

    const result = mergeTaskEvent([b], 'todo', {
      type: 'upsert',
      task: transitionedIn,
    });

    expect(result).toEqual([b, transitionedIn]);
  });

  it('delete -> removes by id', () => {
    const a = makeTask({ id: 'a' });
    const b = makeTask({ id: 'b' });

    const result = mergeTaskEvent([a, b], undefined, {
      type: 'delete',
      id: 'a',
    });

    expect(result).toEqual([b]);
  });

  it('delete for an unknown id -> no-op, list unchanged (same contents)', () => {
    const a = makeTask({ id: 'a' });
    const b = makeTask({ id: 'b' });

    const result = mergeTaskEvent([a, b], undefined, {
      type: 'delete',
      id: 'unknown',
    });

    expect(result).toEqual([a, b]);
  });

  it('filter is undefined ("All") -> every upsert is accepted regardless of status', () => {
    const todo = makeTask({ id: 'a', status: 'todo' });
    const inProgress = makeTask({ id: 'b', status: 'in_progress' });
    const done = makeTask({ id: 'c', status: 'done' });

    let result = mergeTaskEvent([], undefined, {
      type: 'upsert',
      task: todo,
    });
    result = mergeTaskEvent(result, undefined, {
      type: 'upsert',
      task: inProgress,
    });
    result = mergeTaskEvent(result, undefined, {
      type: 'upsert',
      task: done,
    });

    expect(result).toEqual([todo, inProgress, done]);
  });
});
