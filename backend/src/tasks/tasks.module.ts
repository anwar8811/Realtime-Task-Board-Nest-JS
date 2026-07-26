import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TasksController } from './tasks.controller';
import { TasksGateway } from './tasks.gateway';
import { TasksService } from './tasks.service';

@Module({
  // `AuthModule` exports its configured `JwtModule`, so `TasksGateway` can
  // inject the same `JwtService` the REST `JwtStrategy` uses, rather than
  // this module registering a second, parallel `JwtModule`.
  imports: [AuthModule],
  controllers: [TasksController],
  providers: [TasksService, TasksGateway],
  exports: [TasksService],
})
export class TasksModule {}
