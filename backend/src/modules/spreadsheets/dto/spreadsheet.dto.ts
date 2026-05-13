import { Type } from 'class-transformer';
import {
  Allow,
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export enum MergeStrategy {
  Append = 'append',
  JoinByColumn = 'join',
}

export class MergeSourceDto {
  @IsUUID() spreadsheetId!: string;
}

export class MergeDto {
  @IsString() @MaxLength(120) name!: string;

  @IsEnum(MergeStrategy) strategy!: MergeStrategy;

  /** Required only for join strategy. */
  @IsOptional() @IsString() @MaxLength(120) joinOn?: string;

  @IsArray() @ArrayMinSize(2) @ArrayMaxSize(20)
  @ValidateNested({ each: true }) @Type(() => MergeSourceDto)
  sources!: MergeSourceDto[];

  /**
   * If true, sources are deleted after the merge artifact is created. Helps
   * the user keep the workspace tidy without a second round-trip.
   */
  @IsOptional() @IsBoolean() consumeSources?: boolean;
}

export class UpdateCellDto {
  @IsString() @MaxLength(120) column!: string;

  /**
   * Value is intentionally a union of scalars + null; we whitelist the
   * primitive types inside the controller. `@Allow()` is required so the
   * global ValidationPipe (whitelist: true) does not strip it.
   */
  @Allow()
  value!: unknown;
}

export class ListRowsQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) limit?: number;
}

export class ExportQueryDto {
  @IsOptional() @IsEnum(['xlsx', 'csv'] as const) format?: 'xlsx' | 'csv';
}

export class AddColumnDto {
  @IsString() @MaxLength(120) name!: string;
}
