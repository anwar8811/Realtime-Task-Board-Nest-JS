import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiService } from './ai.service';
import { SummarizeDto, SummarizeResponse } from './dto/summarize.dto';

/**
 * `JwtAuthGuard` alone (identity check) is the only access control this
 * route needs — it persists nothing and touches no task row, so there is no
 * role/ownership `where` clause to apply here (contrast with
 * tasks.controller.ts, which goes through task-access.guard.ts).
 */
@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  // 200, not Nest's default 201 for POST — nothing is created/persisted.
  @Post('summarize')
  @HttpCode(HttpStatus.OK)
  summarize(@Body() dto: SummarizeDto): Promise<SummarizeResponse> {
    return this.aiService.summarize(dto);
  }
}
