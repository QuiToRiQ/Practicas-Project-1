import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  CellValue,
  ISpreadsheetRepository,
  SpreadsheetRecord,
} from '../../core/storage/ports/spreadsheet.repository';
import { SPREADSHEET_REPOSITORY } from '../../core/storage/ports/tokens';

@Injectable()
export class MergeService {
  constructor(
    @Inject(SPREADSHEET_REPOSITORY) private readonly sheets: ISpreadsheetRepository,
  ) {}

  /** Pages through every row of a source sheet without loading them all at once. */
  private async *iterateRows(
    spreadsheetId: string,
  ): AsyncGenerator<Record<string, CellValue>> {
    const pageSize = 500;
    let offset = 0;
    while (true) {
      const page = await this.sheets.listRows({ spreadsheetId, offset, limit: pageSize });
      if (!page.length) return;
      for (const row of page) yield row.data;
      if (page.length < pageSize) return;
      offset += pageSize;
    }
  }

  async append(
    sources: SpreadsheetRecord[],
  ): Promise<{ columns: string[]; rows: Record<string, CellValue>[] }> {
    const columns = Array.from(new Set(sources.flatMap((s) => s.columns)));
    const rows: Record<string, CellValue>[] = [];
    for (const src of sources) {
      for await (const data of this.iterateRows(src.id)) {
        const normalized: Record<string, CellValue> = {};
        for (const col of columns) normalized[col] = data[col] ?? null;
        rows.push(normalized);
      }
    }
    return { columns, rows };
  }

  async joinByColumn(
    sources: SpreadsheetRecord[],
    joinColumn: string,
  ): Promise<{ columns: string[]; rows: Record<string, CellValue>[] }> {
    for (const s of sources) {
      if (!s.columns.includes(joinColumn)) {
        throw new BadRequestException(`source "${s.name}" lacks join column "${joinColumn}"`);
      }
    }
    const otherCols = Array.from(
      new Set(sources.flatMap((s) => s.columns.filter((c) => c !== joinColumn))),
    );
    const columns = [joinColumn, ...otherCols];
    const merged = new Map<string, Record<string, CellValue>>();

    for (const src of sources) {
      for await (const data of this.iterateRows(src.id)) {
        const key = data[joinColumn];
        if (key === null || key === undefined || key === '') continue;
        const k = String(key);
        const existing = merged.get(k) ?? { [joinColumn]: key };
        for (const col of otherCols) {
          if (data[col] !== undefined && data[col] !== null && data[col] !== '') {
            existing[col] = data[col]!;
          } else if (existing[col] === undefined) {
            existing[col] = null;
          }
        }
        merged.set(k, existing);
      }
    }
    return { columns, rows: Array.from(merged.values()) };
  }
}
