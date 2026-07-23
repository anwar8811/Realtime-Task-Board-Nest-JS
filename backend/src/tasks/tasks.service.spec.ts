import { NotFoundException } from '@nestjs/common';
import { Prisma, TaskStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from './task-access.guard';
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

    service = new TasksService(prisma as unknown as PrismaService);
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
});
