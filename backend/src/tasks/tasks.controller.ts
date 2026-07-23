import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseEnumPipe,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { TaskStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TasksService } from './tasks.service';
import { AuthenticatedUser } from './task-access.guard';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

/**
 * Identity (a valid JWT) is required for every task route. Role/ownership
 * scoping is NOT decided here — every method just forwards `request.user`
 * into `TasksService`, which applies the single shared `taskScopeWhere`
 * rule (task-access.guard.ts) inside the Prisma query. No inline
 * `role === 'admin'` checks belong in this controller.
 */
@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  create(
    @Body() createTaskDto: CreateTaskDto,
    @Request() request: { user: AuthenticatedUser },
  ) {
    return this.tasksService.create(request.user.userId, createTaskDto);
  }

  @Get()
  findAll(
    @Request() request: { user: AuthenticatedUser },
    @Query('status', new ParseEnumPipe(TaskStatus, { optional: true }))
    status?: TaskStatus,
  ) {
    return this.tasksService.findAll(request.user, status);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @Request() request: { user: AuthenticatedUser },
  ) {
    return this.tasksService.findOne(request.user, id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateTaskDto: UpdateTaskDto,
    @Request() request: { user: AuthenticatedUser },
  ) {
    return this.tasksService.update(request.user, id, updateTaskDto);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @Request() request: { user: AuthenticatedUser },
  ) {
    return this.tasksService.remove(request.user, id);
  }
}
