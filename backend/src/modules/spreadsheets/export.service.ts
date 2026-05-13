import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { CellValue, SpreadsheetRowRecord } from '../../core/storage/ports/spreadsheet.repository';

@Injectable()
export class ExportService {
  async toXlsx(name: string, columns: string[], rows: SpreadsheetRowRecord[]): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'practicas-tool';
    const ws = wb.addWorksheet(name.slice(0, 30) || 'sheet');
    ws.columns = columns.map((c) => ({ header: c, key: c, width: Math.max(12, c.length + 2) }));
    for (const row of rows) {
      const obj: Record<string, CellValue> = {};
      for (const c of columns) obj[c] = row.data[c] ?? null;
      ws.addRow(obj);
    }
    ws.getRow(1).font = { bold: true };
    const out = await wb.xlsx.writeBuffer();
    return Buffer.from(out as ArrayBuffer);
  }

  toCsv(columns: string[], rows: SpreadsheetRowRecord[]): Buffer {
    const esc = (v: CellValue): string => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [columns.map(esc).join(',')];
    for (const row of rows) {
      lines.push(columns.map((c) => esc(row.data[c] ?? null)).join(','));
    }
    return Buffer.from(lines.join('\n') + '\n', 'utf8');
  }
}
