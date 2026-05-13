import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'permissions' })
export class PermissionEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;

  /** Stable string code, e.g. "sheets:read", "sheets:write", "users:admin". */
  @Column({ type: 'text', unique: true })
  code!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;
}
