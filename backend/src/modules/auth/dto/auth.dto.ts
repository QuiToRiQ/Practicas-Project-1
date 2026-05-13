import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail() @MaxLength(254) email!: string;

  @IsString() @MinLength(12) @MaxLength(256)
  password!: string;

  @IsOptional() @IsString() @MaxLength(120)
  displayName?: string;
}

export class LoginDto {
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @MinLength(1) @MaxLength(256) password!: string;
}
