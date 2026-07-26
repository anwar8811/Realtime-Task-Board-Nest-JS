import '@testing-library/jest-dom';

// STORY-009: any component rendered through a test now potentially pulls in
// useTasks -> useTaskSocket -> lib/socket.ts, which would otherwise open a
// real socket.io-client connection during tests. Mocking the factory here,
// once, for every test file guarantees that can never happen by accident.
jest.mock('@/lib/socket', () => ({
  createTaskSocket: jest.fn(() => ({
    connect: jest.fn(),
    disconnect: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
  })),
}));
