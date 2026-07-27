import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TasksPage from './page';
import { apiFetch } from '@/lib/api';
import type { Task } from '@/hooks/useTasks';

// STORY-005's auth-guard behavior (redirect-when-logged-out) is already
// covered elsewhere — this fixes a stable, logged-in user/token so this
// file only needs to exercise the tasks page itself.
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
}));

jest.mock('@/lib/auth-context', () => ({
  useAuth: () => ({
    token: 'fake-token',
    user: { userId: 'user-1', role: 'user' },
    login: jest.fn(),
    logout: jest.fn(),
    loading: false,
  }),
}));

jest.mock('@/lib/api', () => ({
  apiFetch: jest.fn(),
}));

const mockedApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}

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

describe('TasksPage', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it('renders the fetched task list, then re-fetches and re-renders when a status tab is selected', async () => {
    const todoTask = makeTask({
      id: 't1',
      title: 'Buy groceries',
      status: 'todo',
    });
    const doneTask = makeTask({
      id: 't2',
      title: 'Write report',
      status: 'done',
    });

    mockedApiFetch.mockResolvedValueOnce(jsonResponse([todoTask, doneTask]));

    render(<TasksPage />);

    // AC1: the initially fetched tasks render.
    expect(await screen.findByText('Buy groceries')).toBeInTheDocument();
    expect(screen.getByText('Write report')).toBeInTheDocument();

    mockedApiFetch.mockResolvedValueOnce(jsonResponse([todoTask]));

    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: 'Todo' }));

    // AC2: selecting the filter re-fetches with the filtered query...
    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith('/tasks?status=todo');
    });

    // ...and re-renders: the matching task stays, the excluded one is gone.
    expect(await screen.findByText('Buy groceries')).toBeInTheDocument();
    expect(screen.queryByText('Write report')).not.toBeInTheDocument();
  });

  it('removes a task from the rendered list once its delete is confirmed', async () => {
    const ownTask = makeTask({
      id: 't1',
      title: 'Buy groceries',
      ownerId: 'user-1', // matches the mocked current user -> canMutate
      status: 'todo',
    });
    const otherTask = makeTask({
      id: 't2',
      title: 'Write report',
      ownerId: 'user-2', // not the current user -> no mutate controls
      status: 'done',
    });

    mockedApiFetch.mockResolvedValueOnce(jsonResponse([ownTask, otherTask]));

    render(<TasksPage />);

    expect(await screen.findByText('Buy groceries')).toBeInTheDocument();
    expect(screen.getByText('Write report')).toBeInTheDocument();

    // Queue the DELETE response and the subsequent refetch's GET response
    // before triggering them, since handleDelete awaits apiFetch immediately.
    mockedApiFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    } as Response);
    mockedApiFetch.mockResolvedValueOnce(jsonResponse([otherTask]));

    const user = userEvent.setup();
    // Only ownTask renders Edit/Delete controls, so this is unambiguous.
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith('/tasks/t1', {
        method: 'DELETE',
      });
    });

    await waitFor(() => {
      expect(screen.queryByText('Buy groceries')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Write report')).toBeInTheDocument();
  });
});
