import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { sheetsApi } from '../api/spreadsheets';
import { SpreadsheetGrid } from '../components/SpreadsheetGrid';

export function SheetPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const sheetQ = useQuery({
    queryKey: ['sheet', id],
    queryFn: () => sheetsApi.get(id!),
    enabled: !!id,
  });

  async function download(format: 'xlsx' | 'csv') {
    if (!id) return;
    const { blob, filename } = await sheetsApi.download(id, format);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  if (sheetQ.isError) return <div className="p-6 text-rose-300">Failed to load sheet.</div>;
  if (!sheetQ.data || !id) return <div className="p-6 text-zinc-400">Loading…</div>;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3">
        <div className="flex items-center gap-3">
          <Link to="/" className="btn-ghost">← Back</Link>
          <h2 className="text-base font-semibold">{sheetQ.data.name}</h2>
          <span className="text-xs text-zinc-500">
            {sheetQ.data.rowCount} rows · {sheetQ.data.columns.length} cols
          </span>
          <span className="hidden text-xs text-zinc-600 md:inline">
            · click any cell to edit · Esc cancels · Enter saves
          </span>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => download('csv')}>Export CSV</button>
          <button className="btn-primary" onClick={() => download('xlsx')}>Export XLSX</button>
          <button
            className="btn-danger"
            onClick={async () => {
              if (!confirm(`Delete "${sheetQ.data.name}"?`)) return;
              await sheetsApi.remove(id);
              nav('/');
            }}
          >
            Delete
          </button>
        </div>
      </div>
      <SpreadsheetGrid sheetId={id} />
    </div>
  );
}
