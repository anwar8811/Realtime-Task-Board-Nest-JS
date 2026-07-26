import {
  BadGatewayException,
  GatewayTimeoutException,
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SummarizeDto, SummarizeResponse } from './dto/summarize.dto';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_TIMEOUT_MS = 15_000;

const SYSTEM_PROMPT =
  'You are a concise assistant that writes task descriptions for a task ' +
  'board. Given a task title, and optionally an existing description, ' +
  'reply with a single plain-text description of 1-3 sentences (60 words ' +
  'maximum). Do not use markdown, headings, bullet points, or quotation ' +
  'marks, and do not add any preamble - output only the description text.';

const TIMEOUT_MESSAGE = 'AI summarisation timed out. Try again.';
const RATE_LIMIT_MESSAGE = 'AI service is rate-limited. Try again shortly.';
const GENERIC_UPSTREAM_MESSAGE = 'AI summarisation is currently unavailable.';
const NOT_CONFIGURED_MESSAGE = 'AI summarisation is not configured.';

interface OpenRouterChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

/**
 * Calls OpenRouter's chat-completions endpoint server-to-server to turn a
 * task title (+ optional existing description) into a generated
 * description. Nothing here touches Prisma/the DB — this endpoint persists
 * nothing, so there's no role/ownership scoping to apply (see ai.module.ts).
 */
@Injectable()
export class AiService implements OnModuleInit {
  private readonly logger = new Logger(AiService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Informational only: makes a missing/blank key visible in boot logs
   * without blocking startup, since AI is an optional feature (STORY-014's
   * Docker Compose and every existing e2e test must boot without it).
   */
  onModuleInit(): void {
    const apiKey = this.configService.get<string>('OPENROUTER_API_KEY');
    if (!apiKey || apiKey.trim() === '') {
      this.logger.warn(
        'OPENROUTER_API_KEY is not set — POST /tasks/summarize will return 503 until it is configured.',
      );
    }
  }

  async summarize(dto: SummarizeDto): Promise<SummarizeResponse> {
    const apiKey = this.configService.get<string>('OPENROUTER_API_KEY');
    if (!apiKey || apiKey.trim() === '') {
      throw new ServiceUnavailableException(NOT_CONFIGURED_MESSAGE);
    }

    const model = this.configService.get<string>('OPENROUTER_MODEL');
    const frontendOrigin = this.configService.get<string>('FRONTEND_ORIGIN');

    let userMessage = `Title: ${dto.title}`;
    if (typeof dto.description === 'string' && dto.description.trim() !== '') {
      userMessage += `\nExisting description: ${dto.description}`;
    }

    let response: Response;
    try {
      response = await fetch(OPENROUTER_URL, {
        method: 'POST',
        signal: AbortSignal.timeout(OPENROUTER_TIMEOUT_MS),
        headers: {
          // The API key is used here and ONLY here — never logged, never
          // included in any error surfaced to the client.
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': frontendOrigin ?? '',
          'X-Title': 'Realtime Task Board',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userMessage },
          ],
          temperature: 0.5,
          max_tokens: 200,
        }),
      });
    } catch (error) {
      const name = (error as { name?: string }).name;
      if (name === 'AbortError' || name === 'TimeoutError') {
        this.logError('request aborted/timed out', model, undefined, error);
        throw new GatewayTimeoutException(TIMEOUT_MESSAGE);
      }

      this.logError(
        'network error calling OpenRouter',
        model,
        undefined,
        error,
      );
      throw new BadGatewayException(GENERIC_UPSTREAM_MESSAGE);
    }

    if (!response.ok) {
      const bodyText = await this.safeReadText(response);
      this.logError(
        'non-2xx response from OpenRouter',
        model,
        response.status,
        bodyText,
      );

      if (response.status === 408 || response.status === 504) {
        throw new GatewayTimeoutException(TIMEOUT_MESSAGE);
      }
      if (response.status === 429) {
        throw new BadGatewayException(RATE_LIMIT_MESSAGE);
      }
      throw new BadGatewayException(GENERIC_UPSTREAM_MESSAGE);
    }

    let parsed: OpenRouterChatCompletionResponse;
    try {
      parsed = (await response.json()) as OpenRouterChatCompletionResponse;
    } catch (error) {
      this.logError(
        'response body was not valid JSON',
        model,
        response.status,
        error,
      );
      throw new BadGatewayException(GENERIC_UPSTREAM_MESSAGE);
    }

    const content = parsed.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.trim() === '') {
      this.logError(
        'response JSON missing choices[0].message.content, or content was blank',
        model,
        response.status,
        JSON.stringify(parsed),
      );
      throw new BadGatewayException(GENERIC_UPSTREAM_MESSAGE);
    }

    return { description: content.trim() };
  }

  /**
   * Best-effort read of the upstream error body for server-side logging
   * only — its contents never reach the client (client always gets one of
   * the fixed literal messages above).
   */
  private async safeReadText(response: Response): Promise<string | undefined> {
    try {
      return await response.text();
    } catch {
      return undefined;
    }
  }

  /**
   * Logs enough to diagnose an upstream failure without ever leaking the
   * API key, the Authorization header, or the full headers object. Any
   * upstream body/error is truncated so a large/hostile response can't
   * bloat the logs.
   */
  private logError(
    reason: string,
    model: string | undefined,
    upstreamStatus: number | undefined,
    detail: unknown,
  ): void {
    const truncatedDetail = this.truncate(this.stringifyDetail(detail));
    this.logger.error(
      `OpenRouter summarize failed: ${reason} (model=${model}, upstreamStatus=${upstreamStatus ?? 'n/a'}) detail=${truncatedDetail}`,
    );
  }

  private stringifyDetail(detail: unknown): string {
    if (detail instanceof Error) {
      return `${detail.name}: ${detail.message}`;
    }
    if (typeof detail === 'string') {
      return detail;
    }
    try {
      return JSON.stringify(detail);
    } catch {
      return String(detail);
    }
  }

  private truncate(value: string, max = 500): string {
    return value.length > max ? `${value.slice(0, max)}...` : value;
  }
}
