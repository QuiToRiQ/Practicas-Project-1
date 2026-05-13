export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string | null;
  isActive: boolean;
  roleNames: string[];
  createdAt: Date;
}

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  displayName?: string | null;
  roleNames: string[];
}

export interface ListUsersQuery {
  search?: string;
  offset: number;
  limit: number;
}

export interface UpdateUserInput {
  displayName?: string | null;
  isActive?: boolean;
  passwordHash?: string;
}

export interface IUserRepository {
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  create(input: CreateUserInput): Promise<UserRecord>;
  setActive(id: string, isActive: boolean): Promise<void>;

  /** Paginated listing with optional case-insensitive search on email / displayName. */
  list(query: ListUsersQuery): Promise<{ users: UserRecord[]; total: number }>;
  update(id: string, patch: UpdateUserInput): Promise<UserRecord>;
  /** Replace the user's role assignments wholesale with the given set. */
  setRoles(id: string, roleNames: string[]): Promise<UserRecord>;
  delete(id: string): Promise<void>;
  /** How many users currently hold the named role. Used to guard last-admin deletion. */
  countByRole(roleName: string): Promise<number>;
  /** Total user count (optionally filtered to active users only). */
  count(filter?: { isActive?: boolean }): Promise<number>;
}
