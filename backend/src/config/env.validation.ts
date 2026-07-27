import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

export const DEFAULT_OPENROUTER_MODEL = 'google/gemma-4-26b-a4b-it:free';

class EnvironmentVariables {
  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  @IsInt()
  @Min(0)
  @Max(65535)
  PORT: number = 3000;

  @IsEnum(Environment)
  NODE_ENV: Environment = Environment.Development;

  @IsString()
  @MinLength(32)
  JWT_SECRET: string;

  @IsOptional()
  @IsString()
  JWT_EXPIRES_IN: string = '1h';

  @IsOptional()
  @IsString()
  FRONTEND_ORIGIN: string = 'http://localhost:3001';

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  OPENROUTER_MODEL: string = DEFAULT_OPENROUTER_MODEL;

  // Genuinely optional, no default — the app (and STORY-014's Docker
  // Compose / every existing e2e test) must boot fine with no key present.
  // AiService reads this at call time and returns 503 if it's missing.
  //
  // No @IsNotEmpty() here deliberately: @IsOptional() only skips validation
  // for null/undefined, not for an empty string — and Docker Compose's env
  // interpolation (and dotenv) both turn an unset-but-declared
  // `OPENROUTER_API_KEY=` into an empty string, not an absent key. AiService
  // already treats an empty string as "not configured" at call time, so
  // requiring non-empty here would wrongly crash the app at boot.
  @IsOptional()
  @IsString()
  OPENROUTER_API_KEY?: string;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  return validatedConfig;
}
