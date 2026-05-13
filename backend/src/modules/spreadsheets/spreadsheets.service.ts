import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CellValue,
  ISpreadsheetRepository,
  SpreadsheetRecord,
  SpreadsheetRowRecord,
} from '../../core/storage/ports/spreadsheet.repository';
import { SPREADSHEET_REPOSITORY } from '../../core/storage/ports/tokens';
import { MergeDto, MergeStrategy } from './dto/spreadsheet.dto';
import { ExportService } from './export.service';
import { MergeService } from './merge.service';
import { SpreadsheetParser } from './parser.service';

@Injectable()
export class SpreadsheetsService {
  constructor(
    @Inject(SPREADSHEET_REPOSITORY) private readonly repo: ISpreadsheetRepository,
    private readonly parser: SpreadsheetParser,
    private readonly merger: MergeService,
    private readonly exporter: ExportService,
  ) {}

  async uploadOne(input: {
    ownerId: string;
    originalName: string;
    buffer: Buffer;
  }): Promise<SpreadsheetRecord> {
    const parsed = await this.parser.parse(input.buffer, input.originalName);
    if (!parsed.columns.length) {
      throw new BadRequestException('file has no header row');
    }
    const cleanName = input.originalName.replace(/\.(xlsx|csv)$/i, '').slice(0, 120) || 'sheet';
    return this.repo.create({
      ownerId: input.ownerId,
      name: cleanName,
      columns: parsed.columns,
      rows: parsed.rows,
    });
  }

  async list(ownerId: string): Promise<SpreadsheetRecord[]> {
    return this.repo.listForOwner(ownerId);
  }

  async get(id: string, requesterId: string): Promise<SpreadsheetRecord> {
    const s = await this.repo.findById(id, requesterId);
    if (!s) throw new NotFoundException();
    return s;
  }

  async listRows(input: {
    spreadsheetId: string;
    requesterId: string;
    offset: number;
    limit: number;
  }): Promise<{ rows: SpreadsheetRowRecord[]; total: number; columns: string[] }> {
    const sheet = await this.get(input.spreadsheetId, input.requesterId);
    const rows = await this.repo.listRows({
      spreadsheetId: sheet.id,
      offset: input.offset,
      limit: input.limit,
    });
    return { rows, total: sheet.rowCount, columns: sheet.columns };
  }

  async updateCell(input: {
    spreadsheetId: string;
    rowId: string;
    column: string;
    value: CellValue;
    requesterId: string;
  }): Promise<SpreadsheetRowRecord> {
    return this.repo.updateCell(input);
  }

  async delete(id: string, requesterId: string): Promise<void> {
    await this.repo.delete(id, requesterId);
  }

  async addRow(input: { spreadsheetId: string; requesterId: string }): Promise<SpreadsheetRowRecord> {
    return this.repo.addRow(input);
  }

  async addColumn(input: {
    spreadsheetId: string;
    requesterId: string;
    columnName: string;
  }): Promise<SpreadsheetRecord> {
    return this.repo.addColumn(input);
  }

  async merge(ownerId: string, dto: MergeDto): Promise<SpreadsheetRecord> {
    const sources: SpreadsheetRecord[] = [];
    for (const src of dto.sources) {
      const s = await this.repo.findById(src.spreadsheetId, ownerId);
      if (!s) throw new NotFoundException(`source ${src.spreadsheetId} not found`);
      sources.push(s);
    }

    let merged;
    if (dto.strategy === MergeStrategy.JoinByColumn) {
      if (!dto.joinOn) throw new BadRequestException('joinOn required for join strategy');
      merged = await this.merger.joinByColumn(sources, dto.joinOn);
    } else {
      merged = await this.merger.append(sources);
    }

    const created = await this.repo.create({
      ownerId,
      name: dto.name,
      columns: merged.columns,
      rows: merged.rows,
    });

    if (dto.consumeSources) {
      for (const s of sources) await this.repo.delete(s.id, ownerId);
    }
    return created;
  }

  async export(
    id: string,
    requesterId: string,
    format: 'xlsx' | 'csv',
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    const sheet = await this.get(id, requesterId);
    const all: SpreadsheetRowRecord[] = [];
    const pageSize = 1000;
    let offset = 0;
    while (true) {
      const page = await this.repo.listRows({ spreadsheetId: sheet.id, offset, limit: pageSize });
      all.push(...page);
      if (page.length < pageSize) break;
      offset += pageSize;
    }
    const safeName = sheet.name.replace(/[^a-zA-Z0-9_\-]+/g, '_').slice(0, 80) || 'export';
    if (format === 'csv') {
      return {
        buffer: this.exporter.toCsv(sheet.columns, all),
        contentType: 'text/csv; charset=utf-8',
        filename: `${safeName}.csv`,
      };
    }
    return {
      buffer: await this.exporter.toXlsx(sheet.name, sheet.columns, all),
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: `${safeName}.xlsx`,
    };
  }
}
