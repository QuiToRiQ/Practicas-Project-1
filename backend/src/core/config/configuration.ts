import { plainToInstance } from 'class-transformer';
import {
  IsBooleanString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export class EnvConfig {
  @IsString() @IsIn(['development', 'production', 'test']) NODE_ENV!: string;
  @IsInt() @Min(1) PORT!: number;

  @IsString() @IsNotEmpty() DB_HOST!: string;
  @IsInt() DB_PORT!: number;
  @IsString() @IsNotEmpty() DB_NAME!: string;
  @IsString() @IsNotEmpty() DB_USER!: string;
  @IsString() @IsNotEmpty() DB_PASSWORD!: string;

  @IsString() @MinLength(32) JWT_ACCESS_SECRET!: string;
  @IsString() @MinLength(32) JWT_REFRESH_SECRET!: string;
  @IsInt() JWT_ACCESS_TTL!: number;
  @IsInt() JWT_REFRESH_TTL!: number;

  @IsIn(['local', 'azure', 'gcs']) STORAGE_DRIVER!: 'local' | 'azure' | 'gcs';
  @IsOptional() @IsString() STORAGE_LOCAL_PATH?: string;

  @IsString() COOKIE_DOMAIN!: string;
  @IsBooleanString() COOKIE_SECURE!: string;
  @IsString() CORS_ORIGIN!: string;

  @IsInt() MAX_UPLOAD_BYTES!: number;
  @IsInt() MAX_ROWS_PER_FILE!: number;

  @IsInt() THROTTLE_TTL!: number;
  @IsInt() THROTTLE_LIMIT!: number;
}

export function validateEnv(raw: Record<string, unknown>): EnvConfig {
  const numbers = [
    'PORT', 'DB_PORT', 'JWT_ACCESS_TTL', 'JWT_REFRESH_TTL',
    'MAX_UPLOAD_BYTES', 'MAX_ROWS_PER_FILE', 'THROTTLE_TTL', 'THROTTLE_LIMIT',
  ];
  const coerced: Record<string, unknown> = { ...raw };
  for (const k of numbers) if (coerced[k] !== undefined) coerced[k] = Number(coerced[k]);

  const cfg = plainToInstance(EnvConfig, coerced, { enableImplicitConversion: false });
  const errors = validateSync(cfg, { skipMissingProperties: false });
  if (errors.length) {
    const summary = errors.map((e) => `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${summary}`);
  }
  return cfg;
}
