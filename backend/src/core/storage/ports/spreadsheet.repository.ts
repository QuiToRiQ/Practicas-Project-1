export type CellValue = string | number | boolean | null;

export interface SpreadsheetRecord {
  id: string;
  ownerId: string;
  name: string;
  columns: string[];
  rowCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SpreadsheetRowRecord {
  id: string;
  spreadsheetId: string;
  rowIndex: number;
  data: Record<string, CellValue>;
}

export interface CreateSpreadsheetInput {
  ownerId: string;
  name: string;
  columns: string[];
  rows: Record<string, CellValue>[];
}

export interface ListRowsQuery {
  spreadsheetId: string;
  offset: number;
  limit: number;
}

export interface ISpreadsheetRepository {
  create(input: CreateSpreadsheetInput): Promise<SpreadsheetRecord>;
  findById(id: string, requesterId: string): Promise<SpreadsheetRecord | null>;
  listForOwner(ownerId: string): Promise<SpreadsheetRecord[]>;
  listRows(query: ListRowsQuery): Promise<SpreadsheetRowRecord[]>;
  updateCell(input: {
    spreadsheetId: string;
    rowId: string;
    column: string;
    value: CellValue;
    requesterId: string;
  }): Promise<SpreadsheetRowRecord>;
  delete(id: string, requesterId: string): Promise<void>;

  // ── Admin-only operations ──
  /** Total number of spreadsheets in the system. */
  countAll(): Promise<number>;
  /** Sum of row_count across all spreadsheets — cheap aggregate for dashboards. */
  sumRowCount(): Promise<number>;
  /** Cascade-delete every spreadsheet (and its rows) belonging to one owner. */
  deleteAllForOwner(ownerId: string): Promise<void>;
}
