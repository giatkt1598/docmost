import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export const SSO_PROVIDER_TYPES = ['oidc', 'google', 'saml', 'ldap'] as const;
export type SsoProviderType = (typeof SSO_PROVIDER_TYPES)[number];

class SsoProviderFields {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  allowSignup?: boolean;

  @IsOptional()
  @IsBoolean()
  groupSync?: boolean;

  // OIDC / Google
  @IsOptional()
  @IsString()
  oidcIssuer?: string;

  @IsOptional()
  @IsString()
  oidcClientId?: string;

  // write-only: omitted or empty keeps the stored secret
  @IsOptional()
  @IsString()
  oidcClientSecret?: string;

  // SAML
  @IsOptional()
  @IsString()
  samlUrl?: string;

  @IsOptional()
  @IsString()
  samlCertificate?: string;

  // LDAP
  @IsOptional()
  @IsString()
  ldapUrl?: string;

  @IsOptional()
  @IsString()
  ldapBindDn?: string;

  @IsOptional()
  @IsString()
  ldapBindPassword?: string;

  @IsOptional()
  @IsString()
  ldapBaseDn?: string;

  @IsOptional()
  @IsString()
  ldapUserSearchFilter?: string;

  @IsOptional()
  @IsObject()
  ldapUserAttributes?: Record<string, string>;

  @IsOptional()
  @IsBoolean()
  ldapTlsEnabled?: boolean;

  @IsOptional()
  @IsString()
  ldapTlsCaCert?: string;
}

export class CreateSsoProviderDto extends SsoProviderFields {
  @IsIn(SSO_PROVIDER_TYPES)
  type: SsoProviderType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;
}

export class UpdateSsoProviderDto extends SsoProviderFields {
  @IsUUID()
  providerId: string;
}

export class SsoProviderIdDto {
  @IsUUID()
  providerId: string;
}
