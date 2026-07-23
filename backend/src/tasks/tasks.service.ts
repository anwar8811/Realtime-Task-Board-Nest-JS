import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Task, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `ownerId` always comes from the verified JWT (request.user.userId) in
   * the controller — never from the DTO/request body.
   */
  create(ownerId: string, dto: CreateTaskDto): Promise<Task> {
    return this.prisma.task.create({ data: { ...dto, ownerId } });
  }

  /**
   * No role/ownership filtering here on purpose — that shared `where`-clause
   * scoping is STORY-004's job (task-access.guard.ts), so it isn't
   * duplicated per-route.
   */
  findAll(status?: TaskStatus): Promise<Task[]> {
    return this.prisma.task.findMany({
      where: status ? { status } : undefined,
    });
  }

  async findOne(id: string): Promise<Task> {
    return this.getTaskOrThrow(id);
  }

  async update(id: string, dto: UpdateTaskDto): Promise<Task> {
    await this.getTaskOrThrow(id);
    return this.prisma.task.update({ where: { id }, data: dto });
  }

  async remove(id: string): Promise<Task> {
    await this.getTaskOrThrow(id);
    return this.prisma.task.delete({ where: { id } });
  }

  /**
   * Shared not-found handling so a bad/unknown id always surfaces as Nest's
   * NotFoundException (404) instead of a raw Prisma "not found" error
   * (P2025) leaking out of the service.
   */
  private async getTaskOrThrow(id: string): Promise<Task> {
    try {
      return await this.prisma.task.findUniqueOrThrow({ where: { id } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException(`Task with id "${id}" not found`);
      }

      throw error;
    }
  }
}
