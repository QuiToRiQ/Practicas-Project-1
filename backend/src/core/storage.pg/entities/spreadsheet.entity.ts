import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'spreadsheets' })
export class SpreadsheetEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Index()
  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId!: string;

  @Column({ type: 'text' })
  name!: string;

  /** Ordered column header names. */
  @Column({ type: 'jsonb' })
  columns!: string[];

  @Column({ name: 'row_count', type: 'int', default: 0 })
  rowCount!: number;

  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}
