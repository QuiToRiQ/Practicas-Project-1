import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { sheetsApi } from '../api/spreadsheets';
import { MergeDialog } from '../components/MergeDialog';
import { UploadDropzone } from '../components/UploadDropzone';

export function DashboardPage() {
  const qc = useQueryClient();
  const sheetsQ = useQuery({ queryKey: ['sheets'], queryFn: sheetsApi.list });
  const [selected, setSelected] = useState<string[]>([]);
  const [mergeOpen, setMergeOpen] = useState(false);

  const del = useMutation({
    mutationFn: (id: string) => sheetsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sheets'] }),
  });

  function toggle(id: string) {
    setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  }

  return (
    <div className="mx-auto h-full max-w-5xl overflow-y-auto px-5 py-6">
      <h1 className="text-xl font-semibold">Spreadsheets</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Upload Excel or CSV files, merge them, and edit cells inline.
      </p>

      <div className="mt-5">
        <UploadDropzone />
      </div>

      <div className="mt-6 flex items-center justify-between">
        <div className="text-sm text-zinc-300">
          {selected.length > 0
            ? `${selected.length} selected`
            : sheetsQ.data
              ? `${sheetsQ.data.length} files`
              : 'Loading…'}
        </div>
        <div className="flex gap-2">
          <button
            className="btn-primary"
            disabled={selected.length < 2}
            onClick={() => setMergeOpen(true)}
          >
            Merge selected
          </button>
        </div>
      </div>

      <ul className="mt-3 grid gap-2">
        {sheetsQ.data?.map((s) => (
          <li key={s.id} className="card flex items-center justify-between px-4 py-3">
            <label className="flex flex-1 cursor-pointer items-center gap-3">
              <input
                type="checkbox" checked={selected.includes(s.id)}
                onChange={() => toggle(s.id)}
              />
              <div>
                <Link to={`/sheets/${s.id}`} className="font-medium hover:underline">
                  {s.name}
                </Link>
                <div className="text-xs text-zinc-500">
                  {s.rowCount} rows · {s.columns.length} columns ·
                  {' '}updated {new Date(s.updatedAt).toLocaleString()}
                </div>
              </div>
            </label>
            <button
              className="btn-ghost text-rose-300 hover:bg-rose-950/40"
              onClick={() => { if (confirm(`Delete "${s.name}"?`)) del.mutate(s.id); }}
            >
              Delete
            </button>
          </li>
        ))}
        {sheetsQ.data && sheetsQ.data.length === 0 && (
          <li className="text-sm text-zinc-500">No spreadsheets yet — drop one above.</li>
        )}
      </ul>

      {mergeOpen && sheetsQ.data && (
        <MergeDialog
          sheets={sheetsQ.data}
          selectedIds={selected}
          onClose={() => { setMergeOpen(false); setSelected([]); }}
        />
      )}
    </div>
  );
}
