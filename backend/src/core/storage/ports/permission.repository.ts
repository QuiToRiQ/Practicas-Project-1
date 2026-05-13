export interface IPermissionRepository {
  /** Returns the flat set of permission codes (e.g. "sheets:write") for a user. */
  listForUser(userId: string): Promise<string[]>;
}
