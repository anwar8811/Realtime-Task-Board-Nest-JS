import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TaskForm } from './TaskForm';
import { apiFetch } from '@/lib/api';

jest.mock('@/lib/api', () => ({
  apiFetch: jest.fn(),
}));

const mockedApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

describe('TaskForm', () => {
  beforeEach(() => {
    mockedApiFetch.mockClear();
  });

  it('renders the backend field error when submitting a blank title', async () => {
    mockedApiFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        statusCode: 400,
        message: ['title should not be empty'],
      }),
    } as Response);

    render(
      <TaskForm onSuccess={() => {}} onCancel={() => {}} />,
    );

    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'title should not be empty',
    );
  });

  it('fills the description with the AI-generated summary on success', async () => {
    mockedApiFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ description: 'A generated summary.' }),
    } as Response);

    render(<TaskForm onSuccess={() => {}} onCancel={() => {}} />);

    await userEvent.type(screen.getByLabelText(/title/i), 'Buy groceries');
    await userEvent.click(
      screen.getByRole('button', { name: /ai summarise/i }),
    );

    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/tasks/summarize',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(await screen.findByLabelText(/description/i)).toHaveValue(
      'A generated summary.',
    );
  });

  it('disables the Summarise button when the title is blank', async () => {
    render(<TaskForm onSuccess={() => {}} onCancel={() => {}} />);

    expect(
      screen.getByRole('button', { name: /ai summarise/i }),
    ).toBeDisabled();

    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('shows an inline error and leaves the description untouched on failure', async () => {
    mockedApiFetch.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => ({
        statusCode: 502,
        message: 'AI summarisation is currently unavailable.',
      }),
    } as Response);

    render(<TaskForm onSuccess={() => {}} onCancel={() => {}} />);

    await userEvent.type(screen.getByLabelText(/title/i), 'Buy groceries');
    await userEvent.type(
      screen.getByLabelText(/description/i),
      'Existing description',
    );
    await userEvent.click(
      screen.getByRole('button', { name: /ai summarise/i }),
    );

    expect(await screen.findByTestId('summarize-error')).toHaveTextContent(
      'AI summarisation is currently unavailable.',
    );
    expect(screen.getByLabelText(/description/i)).toHaveValue(
      'Existing description',
    );
  });
});
