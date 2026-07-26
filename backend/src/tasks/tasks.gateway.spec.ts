import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Task, TaskStatus, UserRole } from '@prisma/client';
import { Server, Socket } from 'socket.io';
import { TasksGateway } from './tasks.gateway';

/**
 * STORY-008 Test Scenarios:
 * - No token / invalid token at connect time -> disconnected, never joins
 *   any room.
 * - A valid `user` token joins only `user:<id>`; a valid `admin` token also
 *   joins `admin`.
 * - Each emit method calls `server.to()` exactly once with the single
 *   room-union array (`['admin', 'user:<ownerId>']`) — never two separate
 *   `.to().emit()` calls, which would double-deliver to an admin who also
 *   owns the task.
 */
describe('TasksGateway', () => {
  const buildGateway = () => {
    const jwtService = { verifyAsync: jest.fn() };
    const configService = { get: jest.fn().mockReturnValue('test-secret') };
    const gateway = new TasksGateway(
      jwtService as unknown as JwtService,
      configService as unknown as ConfigService,
    );

    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    gateway.server = { to } as unknown as Server;

    const socket = {
      handshake: { auth: {} as Record<string, unknown> },
      join: jest.fn(),
      disconnect: jest.fn(),
    };

    return { gateway, jwtService, configService, to, emit, socket };
  };

  describe('handleConnection', () => {
    it('disconnects and never joins any room when no token is provided', async () => {
      const { gateway, socket, jwtService } = buildGateway();

      await gateway.handleConnection(socket as unknown as Socket);

      expect(socket.disconnect).toHaveBeenCalledWith(true);
      expect(socket.join).not.toHaveBeenCalled();
      expect(jwtService.verifyAsync).not.toHaveBeenCalled();
    });

    it('disconnects when the token fails verification (invalid/expired)', async () => {
      const { gateway, socket, jwtService } = buildGateway();
      socket.handshake.auth.token = 'garbage-token';
      jwtService.verifyAsync.mockRejectedValue(new Error('invalid token'));

      await gateway.handleConnection(socket as unknown as Socket);

      expect(socket.disconnect).toHaveBeenCalledWith(true);
      expect(socket.join).not.toHaveBeenCalled();
    });

    it('joins only `user:<id>` for a valid `user`-role token', async () => {
      const { gateway, socket, jwtService } = buildGateway();
      socket.handshake.auth.token = 'valid-user-token';
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'user-1',
        role: UserRole.user,
      });

      await gateway.handleConnection(socket as unknown as Socket);

      expect(socket.disconnect).not.toHaveBeenCalled();
      expect(socket.join).toHaveBeenCalledTimes(1);
      expect(socket.join).toHaveBeenCalledWith('user:user-1');
    });

    it('joins `user:<id>` AND `admin` for a valid `admin`-role token', async () => {
      const { gateway, socket, jwtService } = buildGateway();
      socket.handshake.auth.token = 'valid-admin-token';
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'admin-1',
        role: UserRole.admin,
      });

      await gateway.handleConnection(socket as unknown as Socket);

      expect(socket.disconnect).not.toHaveBeenCalled();
      expect(socket.join).toHaveBeenCalledTimes(2);
      expect(socket.join).toHaveBeenCalledWith('user:admin-1');
      expect(socket.join).toHaveBeenCalledWith('admin');
    });
  });

  describe('emit methods', () => {
    const task: Task = {
      id: 'task-1',
      title: 'a task',
      description: null,
      status: TaskStatus.todo,
      ownerId: 'owner-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('emitTaskCreated: calls `server.to()` exactly once with the room-union array and emits `task.created` with the full task', () => {
      const { gateway, to, emit } = buildGateway();

      gateway.emitTaskCreated(task);

      expect(to).toHaveBeenCalledTimes(1);
      expect(to).toHaveBeenCalledWith(['admin', 'user:owner-1']);
      expect(emit).toHaveBeenCalledTimes(1);
      expect(emit).toHaveBeenCalledWith('task.created', task);
    });

    it('emitTaskUpdated: calls `server.to()` exactly once with the room-union array and emits `task.updated` with the full task', () => {
      const { gateway, to, emit } = buildGateway();

      gateway.emitTaskUpdated(task);

      expect(to).toHaveBeenCalledTimes(1);
      expect(to).toHaveBeenCalledWith(['admin', 'user:owner-1']);
      expect(emit).toHaveBeenCalledTimes(1);
      expect(emit).toHaveBeenCalledWith('task.updated', task);
    });

    it('emitTaskDeleted: calls `server.to()` exactly once with the room-union array and emits `task.deleted` with just the id', () => {
      const { gateway, to, emit } = buildGateway();

      gateway.emitTaskDeleted('task-1', 'owner-1');

      expect(to).toHaveBeenCalledTimes(1);
      expect(to).toHaveBeenCalledWith(['admin', 'user:owner-1']);
      expect(emit).toHaveBeenCalledTimes(1);
      expect(emit).toHaveBeenCalledWith('task.deleted', { id: 'task-1' });
    });
  });
});
