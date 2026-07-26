import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Task, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser, taskScopeWhere } from './task-access.guard';
import { TasksGateway } from './tasks.gateway';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: TasksGateway,
  ) {}

  /**
   * `ownerId` always comes from the verified JWT (request.user.userId) in
   * the controller — never from the DTO/request body. The realtime event
   * only fires after the write has actually succeeded (never before, and
   * never from the controller).
   */
  async create(ownerId: string, dto: CreateTaskDto): Promise<Task> {
    const task = await this.prisma.task.create({ data: { ...dto, ownerId } });
    this.gateway.emitTaskCreated(task);
    return task;
  }

  /**
   * `taskScopeWhere` (task-access.guard.ts) is the single shared rule:
   * admin -> `{}` (sees everything), user -> `{ ownerId: user.userId }`.
   * Merged straight into the Prisma `where`, so scoping happens in the
   * query itself rather than fetch-all-then-filter-in-JS.
   */
  findAll(user: AuthenticatedUser, status?: TaskStatus): Promise<Task[]> {
    return this.prisma.task.findMany({
      where: { ...taskScopeWhere(user), ...(status ? { status } : {}) },
    });
  }

  async findOne(user: AuthenticatedUser, id: string): Promise<Task> {
    return this.getTaskOrThrow(user, id);
  }

  /**
   * The update itself is scoped in the same query (`where: { id,
   * ...taskScopeWhere(user) }`) rather than checked-then-acted-on in two
   * separate queries — this avoids a TOCTOU gap and saves a round-trip.
   * Prisma's extended-where-unique-fields support lets us merge the scope
   * filter alongside the unique `id` here, same as `getTaskOrThrow` does
   * for reads.
   */
  async update(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateTaskDto,
  ): Promise<Task> {
    const task = await this.runScopedOrThrow(id, () =>
      this.prisma.task.update({
        where: { id, ...taskScopeWhere(user) },
        data: dto,
      }),
    );
    this.gateway.emitTaskUpdated(task);
    return task;
  }

  async remove(user: AuthenticatedUser, id: string): Promise<Task> {
    const task = await this.runScopedOrThrow(id, () =>
      this.prisma.task.delete({
        where: { id, ...taskScopeWhere(user) },
      }),
    );
    // `ownerId` comes from the Prisma-returned deleted row, never from the
    // acting user — an admin deleting another user's task must emit into
    // that OTHER user's room, not the admin's own.
    this.gateway.emitTaskDeleted(task.id, task.ownerId);
    return task;
  }

  /**
   * Shared not-found + scoping handling: a bad/unknown id, OR a `user`-role
   * request for a task it doesn't own, both surface identically as a 404
   * (NotFoundException) — the scoped query simply finds nothing in the
   * cross-owner case, so no separate 403 branch/data-leak risk exists here.
   */
  private async getTaskOrThrow(
    user: AuthenticatedUser,
    id: string,
  ): Promise<Task> {
    return this.runScopedOrThrow(id, () =>
      this.prisma.task.findUniqueOrThrow({
        where: { id, ...taskScopeWhere(user) },
      }),
    );
  }

  /**
   * Runs a scoped Prisma call (find/update/delete, each already filtered by
   * `taskScopeWhere(user)` in its own `where`) and translates Prisma's
   * "no matching row" error (P2025) — covering both an unknown id and a
   * `user`-role request for a task it doesn't own — into a 404.
   */
  private async runScopedOrThrow(
    id: string,
    run: () => Promise<Task>,
  ): Promise<Task> {
    try {
      return await run();
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
