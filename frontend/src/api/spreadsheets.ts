import { request, requestBlob } from './client';

export type CellValue = string | number | boolean | null;

export interface Spreadsheet {
  id: string;
  ownerId: string;
  name: string;
  columns: string[];
  rowCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SpreadsheetRow {
  id: string;
  spreadsheetId: string;
  rowIndex: number;
  data: Record<string, CellValue>;
}

export interface RowsPage {
  rows: SpreadsheetRow[];
  total: number;
  columns: string[];
}

export type MergeStrategy = 'append' | 'join';

export const sheetsApi = {
  list: () => request<Spreadsheet[]>('/spreadsheets'),

  get: (id: string) => request<Spreadsheet>(`/spreadsheets/${id}`),

  rows: (id: string, offset: number, limit: number) =>
    request<RowsPage>(`/spreadsheets/${id}/rows?offset=${offset}&limit=${limit}`),

  upload: (files: File[]) => {
    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    return request<{ created: Spreadsheet[] }>('/spreadsheets/upload', {
      method: 'POST',
      body: fd,
    });
  },

  merge: (input: {
    name: string;
    strategy: MergeStrategy;
    joinOn?: string;
    sources: string[];
    consumeSources?: boolean;
  }) =>
    request<Spreadsheet>('/spreadsheets/merge', {
      method: 'POST',
      body: {
        name: input.name,
        strategy: input.strategy,
        joinOn: input.joinOn,
        sources: input.sources.map((spreadsheetId) => ({ spreadsheetId })),
        consumeSources: input.consumeSources,
      },
    }),

  updateCell: (id: string, rowId: string, column: string, value: CellValue) =>
    request<SpreadsheetRow>(`/spreadsheets/${id}/rows/${rowId}`, {
      method: 'PATCH',
      body: { column, value },
    }),

  remove: (id: string) => request<void>(`/spreadsheets/${id}`, { method: 'DELETE' }),

  download: (id: string, format: 'xlsx' | 'csv') =>
    requestBlob(`/spreadsheets/${id}/export?format=${format}`),
};
