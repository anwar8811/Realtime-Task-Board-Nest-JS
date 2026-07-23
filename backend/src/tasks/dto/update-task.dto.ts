import { PartialType } from '@nestjs/mapped-types';
import { CreateTaskDto } from './create-task.dto';

// Makes every CreateTaskDto field optional so PATCH /tasks/:id can accept a
// partial { title?, description?, status? } body while reusing the same
// class-validator rules as create.
export class UpdateTaskDto extends PartialType(CreateTaskDto) {}
