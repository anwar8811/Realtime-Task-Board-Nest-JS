import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { TaskStatus } from '@prisma/client';

export class CreateTaskDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  // Owner is always taken from the verified JWT (request.user.userId) in the
  // controller/service, never from the request body — no ownerId field here.
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;
}
