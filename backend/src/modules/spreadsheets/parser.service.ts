import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as ExcelJS from 'exceljs';
import { fromBuffer as fileTypeFromBuffer } from 'file-type';
import * as XLSX from 'xlsx';
import { CellValue } from '../../core/storage/ports/spreadsheet.repository';

export interface ParsedSheet {
  columns: string[];
  rows: Record<string, CellValue>[];
}

interface FormatHandler {
  extensions: readonly string[];
  /** Magic-byte ext values we'll accept for this handler (undefined → text-only, no magic check). */
  acceptMagic?: readonly string[];
  /** Default delimiter for the text branch. */
  textDelimiter?: ',' | '\t';
  parser: 'csv' | 'xlsx' | 'sheetjs';
}

/**
 * Whitelist of accepted spreadsheet formats. Add a new entry to support a new
 * format — there is intentionally no "fallback" branch, so an unrecognised
 * extension is rejected at the boundary.
 *
 * .xlsm is intentionally absent: Excel macro files can carry payloads that
 * attack the user later when they re-open the export in Excel.
 */
const HANDLERS: FormatHandler[] = [
  { extensions: ['.csv'], parser: 'csv', textDelimiter: ',' },
  { extensions: ['.tsv', '.tab'], parser: 'csv', textDelimiter: '\t' },
  { extensions: ['.xlsx'], parser: 'xlsx', acceptMagic: ['xlsx', 'zip'] },
  { extensions: ['.ods'], parser: 'sheetjs', acceptMagic: ['ods', 'zip'] },
  { extensions: ['.xls'], parser: 'sheetjs', acceptMagic: ['xls', 'cfb'] },
];

@Injectable()
export class SpreadsheetParser {
  constructor(private readonly cfg: ConfigService) {}

  async parse(buffer: Buffer, originalName: string): Promise<ParsedSheet> {
    const maxRows = Number(this.cfg.getOrThrow('MAX_ROWS_PER_FILE'));
    const lower = originalName.toLowerCase();

    // Macro-bearing variants get a specific error so the user knows why.
    if (lower.endsWith('.xlsm') || lower.endsWith('.xlsb') || lower.endsWith('.xltm')) {
      throw new BadRequestException(
        'macro-enabled Excel files are not accepted; re-save as .xlsx',
      );
    }

    const handler = HANDLERS.find((h) => h.extensions.some((ext) => lower.endsWith(ext)));
    if (!handler) {
      const supported = HANDLERS.flatMap((h) => h.extensions).join(', ');
      throw new BadRequestException(`unsupported file type — use one of: ${supported}`);
    }

    if (handler.acceptMagic) {
      const detected = await fileTypeFromBuffer(buffer);
      if (!detected || !handler.acceptMagic.includes(detected.ext)) {
        throw new BadRequestException(
          `file content does not match its ${handler.extensions[0]} extension`,
        );
      }
    }

    switch (handler.parser) {
      case 'csv':
        return this.parseDelimited(buffer.toString('utf8'), handler.textDelimiter ?? ',', maxRows);
      case 'xlsx':
        return this.parseXlsx(buffer, maxRows);
      case 'sheetjs':
        return this.parseWithSheetJs(buffer, maxRows);
    }
  }

  private parseDelimited(text: string, delimiter: ',' | '\t', maxRows: number): ParsedSheet {
    const cleaned = text.replace(/^﻿/, '');
    const lines = cleaned.split(/\r?\n/).filter((l) => l.length > 0);
    if (!lines.length) return { columns: [], rows: [] };

    const split = (line: string): string[] => {
      const out: string[] = [];
      let cur = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (inQuotes) {
          if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
          else if (c === '"') inQuotes = false;
          else cur += c;
        } else {
          if (c === delimiter) { out.push(cur); cur = ''; }
          else if (c === '"') inQuotes = true;
          else cur += c;
        }
      }
      out.push(cur);
      return out;
    };

    const columns = this.dedupeColumns(split(lines[0]!).map((c) => c.trim()));
    const rows: Record<string, CellValue>[] = [];
    for (let i = 1; i < lines.length && rows.length < maxRows; i++) {
      const values = split(lines[i]!);
      const row: Record<string, CellValue> = {};
      for (let c = 0; c < columns.length; c++) {
        row[columns[c]!] = this.coerceText(values[c]);
      }
      rows.push(row);
    }
    return { columns, rows };
  }

  private async parseXlsx(buffer: Buffer, maxRows: number): Promise<ParsedSheet> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    if (!ws) return { columns: [], rows: [] };

    const headerRow = ws.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell({ includeEmpty: false }, (cell) => {
      headers.push(String(cell.value ?? '').trim());
    });
    const columns = this.dedupeColumns(headers);

    const rows: Record<string, CellValue>[] = [];
    for (let r = 2; r <= ws.rowCount && rows.length < maxRows; r++) {
      const row = ws.getRow(r);
      if (!row.hasValues) continue;
      const data: Record<string, CellValue> = {};
      for (let c = 0; c < columns.length; c++) {
        const cell = row.getCell(c + 1);
        data[columns[c]!] = this.fromExcelJsCell(cell.value);
      }
      rows.push(data);
    }
    return { columns, rows };
  }

  /**
   * Handles .ods and legacy .xls via SheetJS — the most complete community
   * parser for those formats. We deliberately don't route .xlsx through this
   * path because ExcelJS's xlsx implementation is closer to what real Excel
   * files actually look like in practice.
   */
  private parseWithSheetJs(buffer: Buffer, maxRows: number): ParsedSheet {
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true, raw: true });
    const firstName = wb.SheetNames[0];
    if (!firstName) return { columns: [], rows: [] };
    const ws = wb.Sheets[firstName]!;
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      defval: null,
      blankrows: false,
      raw: true,
    });
    if (!aoa.length) return { columns: [], rows: [] };

    const headerRow = (aoa[0] ?? []).map((c) => (c === null || c === undefined ? '' : String(c).trim()));
    const columns = this.dedupeColumns(headerRow);

    const rows: Record<string, CellValue>[] = [];
    for (let r = 1; r < aoa.length && rows.length < maxRows; r++) {
      const values = aoa[r] ?? [];
      const data: Record<string, CellValue> = {};
      for (let c = 0; c < columns.length; c++) {
        data[columns[c]!] = this.normalizeCell(values[c]);
      }
      rows.push(data);
    }
    return { columns, rows };
  }

  private dedupeColumns(headers: string[]): string[] {
    const seen = new Map<string, number>();
    return headers.map((raw, idx) => {
      const base = raw || `column_${idx + 1}`;
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      return n === 0 ? base : `${base}_${n + 1}`;
    });
  }

  private coerceText(v: string | undefined): CellValue {
    if (v === undefined || v === '') return null;
    if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
    if (v.toLowerCase() === 'true') return true;
    if (v.toLowerCase() === 'false') return false;
    return v;
  }

  /**
   * Normalise a value coming out of SheetJS (covers .ods and .xls). Dates
   * arrive as JS Date objects when `cellDates: true`; everything else is
   * already a primitive.
   */
  private normalizeCell(v: unknown): CellValue {
    if (v === null || v === undefined) return null;
    if (v instanceof Date) return v.toISOString();
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
    return String(v);
  }

  private fromExcelJsCell(v: ExcelJS.CellValue): CellValue {
    if (v === null || v === undefined) return null;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
    if (v instanceof Date) return v.toISOString();
    if (typeof v === 'object') {
      const obj = v as { result?: unknown; text?: unknown; richText?: Array<{ text: string }> };
      if ('result' in obj && obj.result != null) return this.fromExcelJsCell(obj.result as ExcelJS.CellValue);
      if (Array.isArray(obj.richText)) return obj.richText.map((r) => r.text).join('');
      if (typeof obj.text === 'string') return obj.text;
    }
    return String(v);
  }
}
