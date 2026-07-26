import { NotFoundException } from '@nestjs/common';
import { Prisma, TaskStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from './task-access.guard';
import { TasksGateway } from './tasks.gateway';
import { TasksService } from './tasks.service';

describe('TasksService', () => {
  let service: TasksService;
  let prisma: {
    task: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };
  let gateway: {
    emitTaskCreated: jest.Mock;
    emitTaskUpdated: jest.Mock;
    emitTaskDeleted: jest.Mock;
  };

  const adminUser: AuthenticatedUser = {
    userId: 'admin-1',
    role: UserRole.admin,
  };
  const regularUser: AuthenticatedUser = {
    userId: 'user-1',
    role: UserRole.user,
  };

  beforeEach(() => {
    prisma = {
      task: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    gateway = {
      emitTaskCreated: jest.fn(),
      emitTaskUpdated: jest.fn(),
      emitTaskDeleted: jest.fn(),
    };

    service = new TasksService(
      prisma as unknown as PrismaService,
      gateway as unknown as TasksGateway,
    );
  });

  describe('findAll', () => {
    it('admin: queries with an unscoped `where` (sees everything) when no status filter is given', async () => {
      prisma.task.findMany.mockResolvedValue([]);

      await service.findAll(adminUser);

      expect(prisma.task.findMany).toHaveBeenCalledWith({ where: {} });
    });

    it('regular user: scopes the query to `where: { ownerId }`', async () => {
      prisma.task.findMany.mockResolvedValue([]);

      await service.findAll(regularUser);

      expect(prisma.task.findMany).toHaveBeenCalledWith({
        where: { ownerId: regularUser.userId },
      });
    });

    it('regular user + status filter: merges `ownerId` and `status` into one `where`', async () => {
      prisma.task.findMany.mockResolvedValue([]);

      await service.findAll(regularUser, TaskStatus.done);

      expect(prisma.task.findMany).toHaveBeenCalledWith({
        where: { ownerId: regularUser.userId, status: TaskStatus.done },
      });
    });

    it('admin + status filter: `where` only has `status`, no ownerId', async () => {
      prisma.task.findMany.mockResolvedValue([]);

      await service.findAll(adminUser, TaskStatus.done);

      expect(prisma.task.findMany).toHaveBeenCalledWith({
        where: { status: TaskStatus.done },
      });
    });
  });

  describe('scoped lookups (findOne/update/remove)', () => {
    it('regular user: findOne merges `ownerId` into the `where`', async () => {
      const task = { id: 'task-1', ownerId: regularUser.userId };
      prisma.task.findUniqueOrThrow.mockResolvedValue(task);

      await service.findOne(regularUser, 'task-1');

      expect(prisma.task.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: 'task-1', ownerId: regularUser.userId },
      });
    });

    it('admin: findOne queries by id only (no ownerId restriction)', async () => {
      const task = { id: 'task-1', ownerId: 'someone-else' };
      prisma.task.findUniqueOrThrow.mockResolvedValue(task);

      await service.findOne(adminUser, 'task-1');

      expect(prisma.task.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: 'task-1' },
      });
    });

    it('regular user: update scopes the single `update` call to `where: { id, ownerId }` (no separate pre-check query)', async () => {
      const task = { id: 'task-1', ownerId: regularUser.userId };
      prisma.task.update.mockResolvedValue(task);

      await service.update(regularUser, 'task-1', { title: 'new title' });

      expect(prisma.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1', ownerId: regularUser.userId },
        data: { title: 'new title' },
      });
      expect(prisma.task.findUniqueOrThrow).not.toHaveBeenCalled();
    });

    it('admin: update scopes the `update` call by id only (no ownerId restriction)', async () => {
      const task = { id: 'task-1', ownerId: 'someone-else' };
      prisma.task.update.mockResolvedValue(task);

      await service.update(adminUser, 'task-1', { title: 'new title' });

      expect(prisma.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { title: 'new title' },
      });
    });

    it('regular user: remove scopes the single `delete` call to `where: { id, ownerId }` (no separate pre-check query)', async () => {
      const task = { id: 'task-1', ownerId: regularUser.userId };
      prisma.task.delete.mockResolvedValue(task);

      await service.remove(regularUser, 'task-1');

      expect(prisma.task.delete).toHaveBeenCalledWith({
        where: { id: 'task-1', ownerId: regularUser.userId },
      });
      expect(prisma.task.findUniqueOrThrow).not.toHaveBeenCalled();
    });

    it('admin: remove scopes the `delete` call by id only (no ownerId restriction)', async () => {
      const task = { id: 'task-1', ownerId: 'someone-else' };
      prisma.task.delete.mockResolvedValue(task);

      await service.remove(adminUser, 'task-1');

      expect(prisma.task.delete).toHaveBeenCalledWith({
        where: { id: 'task-1' },
      });
    });
  });

  describe('not-found + cross-owner handling', () => {
    const notFoundError = new Prisma.PrismaClientKnownRequestError(
      'No Task found',
      { code: 'P2025', clientVersion: '6.19.2' },
    );

    it('findOne throws NotFoundException (not a raw Prisma error) for an unknown id', async () => {
      prisma.task.findUniqueOrThrow.mockRejectedValue(notFoundError);

      await expect(
        service.findOne(adminUser, 'unknown-id'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("a regular user targeting another user's task gets NotFoundException (404, not 403) because the scoped query finds nothing", async () => {
      prisma.task.findUniqueOrThrow.mockRejectedValue(notFoundError);

      await expect(
        service.findOne(regularUser, 'someone-elses-task'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.task.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: 'someone-elses-task', ownerId: regularUser.userId },
      });
    });

    it('update throws NotFoundException when the scoped `update` call finds no matching row (unknown id, or a task owned by someone else)', async () => {
      prisma.task.update.mockRejectedValue(notFoundError);

      await expect(
        service.update(regularUser, 'unknown-id', { title: 'new title' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.task.update).toHaveBeenCalledWith({
        where: { id: 'unknown-id', ownerId: regularUser.userId },
        data: { title: 'new title' },
      });
    });

    it('remove throws NotFoundException when the scoped `delete` call finds no matching row (unknown id, or a task owned by someone else)', async () => {
      prisma.task.delete.mockRejectedValue(notFoundError);

      await expect(
        service.remove(regularUser, 'unknown-id'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.task.delete).toHaveBeenCalledWith({
        where: { id: 'unknown-id', ownerId: regularUser.userId },
      });
    });
  });

  describe('realtime emission (STORY-008)', () => {
    it('create: emits `task.created` via the gateway exactly once with the created task, after the write succeeds', async () => {
      const task = { id: 'task-1', ownerId: regularUser.userId };
      prisma.task.create.mockResolvedValue(task);

      const result = await service.create(regularUser.userId, {
        title: 'new task',
      });

      expect(result).toBe(task);
      expect(gateway.emitTaskCreated).toHaveBeenCalledTimes(1);
      expect(gateway.emitTaskCreated).toHaveBeenCalledWith(task);
      expect(gateway.emitTaskUpdated).not.toHaveBeenCalled();
      expect(gateway.emitTaskDeleted).not.toHaveBeenCalled();
    });

    it('update: emits `task.updated` via the gateway exactly once with the updated task, after the write succeeds', async () => {
      const task = { id: 'task-1', ownerId: regularUser.userId };
      prisma.task.update.mockResolvedValue(task);

      const result = await service.update(regularUser, 'task-1', {
        title: 'new title',
      });

      expect(result).toBe(task);
      expect(gateway.emitTaskUpdated).toHaveBeenCalledTimes(1);
      expect(gateway.emitTaskUpdated).toHaveBeenCalledWith(task);
      expect(gateway.emitTaskCreated).not.toHaveBeenCalled();
      expect(gateway.emitTaskDeleted).not.toHaveBeenCalled();
    });

    it("update: an admin editing another user's task emits into that task's own `ownerId` (from the Prisma row), not the admin's id", async () => {
      const task = { id: 'task-1', ownerId: 'someone-else' };
      prisma.task.update.mockResolvedValue(task);

      await service.update(adminUser, 'task-1', { title: 'new title' });

      expect(gateway.emitTaskUpdated).toHaveBeenCalledWith(task);
    });

    it('remove: emits `task.deleted` via the gateway exactly once with `{id, ownerId}` derived from the deleted row, after the write succeeds', async () => {
      const task = { id: 'task-1', ownerId: regularUser.userId };
      prisma.task.delete.mockResolvedValue(task);

      const result = await service.remove(regularUser, 'task-1');

      expect(result).toBe(task);
      expect(gateway.emitTaskDeleted).toHaveBeenCalledTimes(1);
      expect(gateway.emitTaskDeleted).toHaveBeenCalledWith(
        task.id,
        task.ownerId,
      );
      expect(gateway.emitTaskCreated).not.toHaveBeenCalled();
      expect(gateway.emitTaskUpdated).not.toHaveBeenCalled();
    });

    it("remove: an admin deleting another user's task emits into that OTHER user's ownerId, not the admin's own id", async () => {
      const task = { id: 'task-1', ownerId: 'someone-else' };
      prisma.task.delete.mockResolvedValue(task);

      await service.remove(adminUser, 'task-1');

      expect(gateway.emitTaskDeleted).toHaveBeenCalledWith(
        'task-1',
        'someone-else',
      );
    });

    it('update: a not-found (404) path emits nothing', async () => {
      const notFoundError = new Prisma.PrismaClientKnownRequestError(
        'No Task found',
        { code: 'P2025', clientVersion: '6.19.2' },
      );
      prisma.task.update.mockRejectedValue(notFoundError);

      await expect(
        service.update(regularUser, 'unknown-id', { title: 'new title' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(gateway.emitTaskUpdated).not.toHaveBeenCalled();
    });

    it('remove: a not-found (404) path emits nothing', async () => {
      const notFoundError = new Prisma.PrismaClientKnownRequestError(
        'No Task found',
        { code: 'P2025', clientVersion: '6.19.2' },
      );
      prisma.task.delete.mockRejectedValue(notFoundError);

      await expect(
        service.remove(regularUser, 'unknown-id'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(gateway.emitTaskDeleted).not.toHaveBeenCalled();
    });
  });
});
