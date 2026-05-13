export interface RoleRecord {
  name: string;
  description: string | null;
  permissionCodes: string[];
}

export interface IRoleRepository {
  listAll(): Promise<RoleRecord[]>;
}
