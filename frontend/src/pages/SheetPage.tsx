import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { sheetsApi } from '../api/spreadsheets';
import { ApiError } from '../api/client';
import { SpreadsheetGrid } from '../components/SpreadsheetGrid';

export function SheetPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [structuralError, setStructuralError] = useState<string | null>(null);
  const [showColInput, setShowColInput] = useState(false);
  const [newColName, setNewColName] = useState('');

  const sheetQ = useQuery({
    queryKey: ['sheet', id],
    queryFn: () => sheetsApi.get(id!),
    enabled: !!id,
  });

  function invalidateSheet() {
    if (!id) return;
    void qc.invalidateQueries({ queryKey: ['sheet', id] });
  }

  const addRow = useMutation({
    mutationFn: () => sheetsApi.addRow(id!),
    onSuccess: () => { setStructuralError(null); invalidateSheet(); },
    onError: (e: Error) => setStructuralError(e.message),
  });

  const addColumn = useMutation({
    mutationFn: (name: string) => sheetsApi.addColumn(id!, name),
    onSuccess: () => {
      setStructuralError(null);
      setShowColInput(false);
      setNewColName('');
      invalidateSheet();
    },
    onError: (e: Error) => setStructuralError(
      e instanceof ApiError ? e.message : String(e),
    ),
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
          <button
            className="btn-ghost"
            disabled={addRow.isPending}
            onClick={() => addRow.mutate()}
          >
            {addRow.isPending ? 'Adding…' : '+ Row'}
          </button>
          <button
            className="btn-ghost"
            disabled={addColumn.isPending}
            onClick={() => { setShowColInput(true); setNewColName(''); }}
          >
            + Column
          </button>
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

      {showColInput && (
        <form
          className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900/50 px-5 py-2"
          onSubmit={(e) => {
            e.preventDefault();
            const name = newColName.trim();
            if (!name) return;
            addColumn.mutate(name);
          }}
        >
          <span className="text-xs text-zinc-400">New column name:</span>
          <input
            autoFocus
            className="input max-w-xs"
            placeholder="e.g. Phone, Grade, Notes"
            value={newColName}
            maxLength={120}
            onChange={(e) => setNewColName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') setShowColInput(false); }}
          />
          <button
            type="submit" className="btn-primary"
            disabled={!newColName.trim() || addColumn.isPending}
          >
            {addColumn.isPending ? 'Adding…' : 'Add'}
          </button>
          <button
            type="button" className="btn-ghost"
            onClick={() => { setShowColInput(false); setNewColName(''); }}
          >
            Cancel
          </button>
        </form>
      )}

      {structuralError && (
        <div className="flex items-center justify-between bg-rose-950/60 px-5 py-2 text-sm text-rose-200">
          <span>{structuralError}</span>
          <button className="btn-ghost text-rose-200" onClick={() => setStructuralError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {/* Key includes column/row counts so the grid remounts when the sheet's
          structure changes — fastest way to flush its internal buffer. */}
      <SpreadsheetGrid
        key={`${sheetQ.data.columns.join('|')}-${sheetQ.data.rowCount}`}
        sheetId={id}
      />
    </div>
  );
}
