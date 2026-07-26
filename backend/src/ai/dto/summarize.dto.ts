import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class SummarizeDto {
  // Trim BEFORE @IsNotEmpty runs so a whitespace-only title (e.g. "   ")
  // is correctly rejected as 400 instead of passing as "non-empty".
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;
}

export interface SummarizeResponse {
  description: string;
}
