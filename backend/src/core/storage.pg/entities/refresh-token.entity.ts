import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'refresh_tokens' })
@Index(['userId'])
export class RefreshTokenEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  /** SHA-256 hex of the refresh token. Raw value never persisted. */
  @Index({ unique: true })
  @Column({ name: 'token_hash', type: 'text' })
  tokenHash!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}
