import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

/**
 * Deliberately does not import TasksModule or inject PrismaService/
 * TasksService/TasksGateway — this endpoint calls OpenRouter only and
 * touches no database row, so there's nothing to RBAC-scope beyond the
 * `JwtAuthGuard` identity check already on AiController.
 */
@Module({
  controllers: [AiController],
  providers: [AiService],
})
export class AiModule {}
