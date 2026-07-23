import { NotFoundException } from '@nestjs/common';
import { Prisma, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
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
    it('queries with no `where` clause when no status filter is given', async () => {
      prisma.task.findMany.mockResolvedValue([]);

      await service.findAll();

      expect(prisma.task.findMany).toHaveBeenCalledWith({ where: undefined });
    });

    it('scopes the query to `where: { status }` when a status filter is given', async () => {
      prisma.task.findMany.mockResolvedValue([]);

      await service.findAll(TaskStatus.done);

      expect(prisma.task.findMany).toHaveBeenCalledWith({
        where: { status: TaskStatus.done },
      });
    });
  });

  describe('not-found handling', () => {
    const notFoundError = new Prisma.PrismaClientKnownRequestError(
      'No Task found',
      { code: 'P2025', clientVersion: '6.19.2' },
    );

    it('findOne throws NotFoundException (not a raw Prisma error) for an unknown id', async () => {
      prisma.task.findUniqueOrThrow.mockRejectedValue(notFoundError);

      await expect(service.findOne('unknown-id')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('update throws NotFoundException for an unknown id and never calls prisma.task.update', async () => {
      prisma.task.findUniqueOrThrow.mockRejectedValue(notFoundError);

      await expect(
        service.update('unknown-id', { title: 'new title' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.task.update).not.toHaveBeenCalled();
    });

    it('remove throws NotFoundException for an unknown id and never calls prisma.task.delete', async () => {
      prisma.task.findUniqueOrThrow.mockRejectedValue(notFoundError);

      await expect(service.remove('unknown-id')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.task.delete).not.toHaveBeenCalled();
    });
  });
});
