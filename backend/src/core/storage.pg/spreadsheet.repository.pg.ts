import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  CellValue,
  CreateSpreadsheetInput,
  ISpreadsheetRepository,
  ListRowsQuery,
  SpreadsheetRecord,
  SpreadsheetRowRecord,
} from '../storage/ports/spreadsheet.repository';
import { SpreadsheetRowEntity } from './entities/spreadsheet-row.entity';
import { SpreadsheetEntity } from './entities/spreadsheet.entity';

function toRecord(s: SpreadsheetEntity): SpreadsheetRecord {
  return {
    id: s.id,
    ownerId: s.ownerId,
    name: s.name,
    columns: s.columns,
    rowCount: s.rowCount,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

@Injectable()
export class SpreadsheetPgRepository implements ISpreadsheetRepository {
  constructor(
    @InjectRepository(SpreadsheetEntity) private readonly sheets: Repository<SpreadsheetEntity>,
    @InjectRepository(SpreadsheetRowEntity) private readonly rows: Repository<SpreadsheetRowEntity>,
    private readonly ds: DataSource,
  ) {}

  async create(input: CreateSpreadsheetInput): Promise<SpreadsheetRecord> {
    return this.ds.transaction(async (mgr) => {
      const sheet = await mgr.save(
        mgr.create(SpreadsheetEntity, {
          ownerId: input.ownerId,
          name: input.name,
          columns: input.columns,
          rowCount: input.rows.length,
        }),
      );
      if (input.rows.length) {
        const chunkSize = 1000;
        for (let i = 0; i < input.rows.length; i += chunkSize) {
          const slice = input.rows.slice(i, i + chunkSize).map((data, idx) =>
            mgr.create(SpreadsheetRowEntity, {
              spreadsheetId: sheet.id,
              rowIndex: i + idx,
              data,
            }),
          );
          await mgr.save(SpreadsheetRowEntity, slice);
        }
      }
      return toRecord(sheet);
    });
  }

  private async loadForRequester(id: string, requesterId: string): Promise<SpreadsheetEntity> {
    const s = await this.sheets.findOne({ where: { id } });
    if (!s) throw new NotFoundException('spreadsheet not found');
    if (s.ownerId !== requesterId) throw new ForbiddenException();
    return s;
  }

  async findById(id: string, requesterId: string): Promise<SpreadsheetRecord | null> {
    const s = await this.sheets.findOne({ where: { id } });
    if (!s) return null;
    if (s.ownerId !== requesterId) throw new ForbiddenException();
    return toRecord(s);
  }

  async listForOwner(ownerId: string): Promise<SpreadsheetRecord[]> {
    const list = await this.sheets.find({ where: { ownerId }, order: { updatedAt: 'DESC' } });
    return list.map(toRecord);
  }

  async listRows({ spreadsheetId, offset, limit }: ListRowsQuery): Promise<SpreadsheetRowRecord[]> {
    const rows = await this.rows.find({
      where: { spreadsheetId },
      order: { rowIndex: 'ASC' },
      skip: offset,
      take: limit,
    });
    return rows.map((r) => ({
      id: r.id,
      spreadsheetId: r.spreadsheetId,
      rowIndex: r.rowIndex,
      data: r.data,
    }));
  }

  async updateCell(input: {
    spreadsheetId: string;
    rowId: string;
    column: string;
    value: CellValue;
    requesterId: string;
  }): Promise<SpreadsheetRowRecord> {
    const sheet = await this.loadForRequester(input.spreadsheetId, input.requesterId);
    if (!sheet.columns.includes(input.column)) {
      throw new NotFoundException('unknown column');
    }
    const row = await this.rows.findOne({ where: { id: input.rowId, spreadsheetId: sheet.id } });
    if (!row) throw new NotFoundException('row not found');
    row.data = { ...row.data, [input.column]: input.value };
    const saved = await this.rows.save(row);
    await this.sheets.update({ id: sheet.id }, { updatedAt: new Date() });
    return { id: saved.id, spreadsheetId: saved.spreadsheetId, rowIndex: saved.rowIndex, data: saved.data };
  }

  async delete(id: string, requesterId: string): Promise<void> {
    const sheet = await this.loadForRequester(id, requesterId);
    await this.ds.transaction(async (mgr) => {
      await mgr.delete(SpreadsheetRowEntity, { spreadsheetId: sheet.id });
      await mgr.delete(SpreadsheetEntity, { id: sheet.id });
    });
  }

  async countAll(): Promise<number> {
    return this.sheets.count();
  }

  async sumRowCount(): Promise<number> {
    const row = await this.sheets
      .createQueryBuilder('s')
      .select('COALESCE(SUM(s.row_count), 0)', 'total')
      .getRawOne<{ total: string | number }>();
    return Number(row?.total ?? 0);
  }

  async deleteAllForOwner(ownerId: string): Promise<void> {
    await this.ds.transaction(async (mgr) => {
      // Delete rows belonging to every sheet this user owns, then the sheets.
      await mgr
        .createQueryBuilder()
        .delete()
        .from(SpreadsheetRowEntity)
        .where(
          `spreadsheet_id IN (SELECT id FROM spreadsheets WHERE owner_id = :ownerId)`,
          { ownerId },
        )
        .execute();
      await mgr.delete(SpreadsheetEntity, { ownerId });
    });
  }
}
