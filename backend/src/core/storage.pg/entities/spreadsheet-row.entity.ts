import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { CellValue } from '../../storage/ports/spreadsheet.repository';

@Entity({ name: 'spreadsheet_rows' })
@Index(['spreadsheetId', 'rowIndex'])
export class SpreadsheetRowEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ name: 'spreadsheet_id', type: 'uuid' })
  spreadsheetId!: string;

  /** Stable order within the sheet — gaps allowed for cheap reordering later. */
  @Column({ name: 'row_index', type: 'int' })
  rowIndex!: number;

  @Column({ type: 'jsonb' })
  data!: Record<string, CellValue>;
}
