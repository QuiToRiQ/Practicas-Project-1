import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class ListUsersQueryDto {
  @IsOptional() @IsString() @MaxLength(120) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}

export class UpdateUserDto {
  @IsOptional() @IsString() @MaxLength(120) displayName?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class SetRolesDto {
  @IsArray() @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  roleNames!: string[];
}

export class AdminResetPasswordDto {
  @IsString() @MinLength(12) @MaxLength(256) password!: string;
}
