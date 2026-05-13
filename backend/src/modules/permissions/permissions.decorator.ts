import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'required-permissions';

/** Mark a route handler with the permission codes required to access it. */
export const RequirePermissions = (...codes: string[]) =>
  SetMetadata(PERMISSIONS_KEY, codes);
