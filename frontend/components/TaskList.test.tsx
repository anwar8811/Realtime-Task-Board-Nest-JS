import { render, screen } from '@testing-library/react';
import { TaskList } from './TaskList';
import type { Task } from '@/hooks/useTasks';

describe('TaskList', () => {
  it('renders each task in a non-empty list, with its title and status', () => {
    const taskA: Task = {
      id: 'a',
      title: 'Buy groceries',
      description: null,
      status: 'todo',
      ownerId: 'owner-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const taskB: Task = {
      id: 'b',
      title: 'Write report',
      description: null,
      status: 'done',
      ownerId: 'owner-2',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    render(
      <TaskList
        tasks={[taskA, taskB]}
        loading={false}
        error={null}
        currentUser={null}
        onEdit={jest.fn()}
        onDelete={jest.fn()}
      />,
    );

    expect(screen.getByText('Buy groceries')).toBeInTheDocument();
    expect(screen.getByText('todo')).toBeInTheDocument();
    expect(screen.getByText('Write report')).toBeInTheDocument();
    expect(screen.getByText('done')).toBeInTheDocument();
  });

  it('renders the empty state when there are no tasks', () => {
    render(
      <TaskList
        tasks={[]}
        loading={false}
        error={null}
        currentUser={null}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );

    expect(screen.getByText('No tasks yet.')).toBeInTheDocument();
  });

  it('renders the error state instead of a blank screen', () => {
    render(
      <TaskList
        tasks={[]}
        loading={false}
        error="Failed to load tasks"
        currentUser={null}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Failed to load tasks',
    );
  });
});
