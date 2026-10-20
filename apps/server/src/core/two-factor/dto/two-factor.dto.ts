import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class TwoFactorCodeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  code: string;
}

export class TwoFactorPasswordDto {
  @IsString()
  @IsNotEmpty()
  password: string;
}
