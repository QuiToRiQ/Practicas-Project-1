import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CellValue, sheetsApi, SpreadsheetRow } from '../api/spreadsheets';

const ROW_HEIGHT = 32;
const PAGE_SIZE = 200;

/**
 * Virtualised editable grid. Rows are paged from the API on demand so the
 * client stays responsive even for hundreds of thousands of rows.
 */
export function SpreadsheetGrid({ sheetId }: { sheetId: string }) {
  const qc = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Cumulative buffer of rows by index. Pages are stitched together once they
  // arrive; until then a placeholder is rendered so virtualisation isn't blocked.
  const [buffer, setBuffer] = useState<(SpreadsheetRow | undefined)[]>([]);
  const [total, setTotal] = useState(0);
  const [columns, setColumns] = useState<string[]>([]);
  const [loadedPages, setLoadedPages] = useState<Set<number>>(new Set());

  const initialQ = useQuery({
    queryKey: ['sheet', sheetId, 'rows', 0],
    queryFn: () => sheetsApi.rows(sheetId, 0, PAGE_SIZE),
  });

  useEffect(() => {
    if (!initialQ.data) return;
    setColumns(initialQ.data.columns);
    setTotal(initialQ.data.total);
    setBuffer(() => {
      const next = new Array<SpreadsheetRow | undefined>(initialQ.data.total);
      initialQ.data.rows.forEach((r, i) => { next[i] = r; });
      return next;
    });
    setLoadedPages(new Set([0]));
  }, [initialQ.data]);

  const virtualizer = useVirtualizer({
    count: total,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  // Trigger fetches for pages the virtualizer is about to render.
  useEffect(() => {
    if (total === 0) return;
    const items = virtualizer.getVirtualItems();
    if (items.length === 0) return;
    const firstIdx = items[0]!.index;
    const lastIdx = items[items.length - 1]!.index;
    const firstPage = Math.floor(firstIdx / PAGE_SIZE);
    const lastPage = Math.floor(lastIdx / PAGE_SIZE);
    for (let p = firstPage; p <= lastPage; p++) {
      if (loadedPages.has(p)) continue;
      setLoadedPages((s) => new Set(s).add(p));
      void (async () => {
        const data = await qc.fetchQuery({
          queryKey: ['sheet', sheetId, 'rows', p],
          queryFn: () => sheetsApi.rows(sheetId, p * PAGE_SIZE, PAGE_SIZE),
        });
        setBuffer((prev) => {
          const next = prev.slice();
          data.rows.forEach((r, i) => { next[p * PAGE_SIZE + i] = r; });
          return next;
        });
      })();
    }
  }, [virtualizer, total, loadedPages, qc, sheetId]);

  const [editError, setEditError] = useState<string | null>(null);
  const updateCell = useMutation({
    mutationFn: (input: { rowId: string; column: string; value: CellValue }) =>
      sheetsApi.updateCell(sheetId, input.rowId, input.column, input.value),
    // Optimistic update: paint the new value immediately so the cell doesn't
    // flicker back to its old text while the PATCH is in flight. The server's
    // canonical response (which may have type-coerced the value) replaces it
    // on success; on error we roll back to the snapshot.
    onMutate: ({ rowId, column, value }) => {
      let snapshot: SpreadsheetRow | undefined;
      setBuffer((prev) => {
        const next = prev.slice();
        const idx = next.findIndex((r) => r?.id === rowId);
        if (idx >= 0 && next[idx]) {
          snapshot = next[idx];
          next[idx] = { ...next[idx]!, data: { ...next[idx]!.data, [column]: value } };
        }
        return next;
      });
      return { snapshot };
    },
    onSuccess: (updated) => {
      setEditError(null);
      setBuffer((prev) => {
        const next = prev.slice();
        const idx = next.findIndex((r) => r?.id === updated.id);
        if (idx >= 0) next[idx] = updated;
        return next;
      });
    },
    onError: (err: Error, _input, context) => {
      setEditError(err.message);
      // Roll back to the pre-mutation snapshot if we have one.
      if (context?.snapshot) {
        const snap = context.snapshot;
        setBuffer((prev) => {
          const next = prev.slice();
          const idx = next.findIndex((r) => r?.id === snap.id);
          if (idx >= 0) next[idx] = snap;
          return next;
        });
      }
    },
  });

  const colWidths = useMemo(() => columns.map(() => 180), [columns]);
  const totalWidth = useMemo(() => 56 + colWidths.reduce((a, b) => a + b, 0), [colWidths]);

  if (initialQ.isError) {
    return <div className="p-6 text-rose-300">Failed to load sheet.</div>;
  }
  if (!initialQ.data) {
    return <div className="p-6 text-zinc-400">Loading…</div>;
  }

  return (
    <div className="flex h-full flex-col">
      {editError && (
        <div className="flex items-center justify-between bg-rose-950/60 px-4 py-2 text-sm text-rose-200">
          <span>Cell update failed: {editError}</span>
          <button className="btn-ghost text-rose-200" onClick={() => setEditError(null)}>Dismiss</button>
        </div>
      )}
      <div ref={scrollRef} className="flex-1 overflow-auto">
        <div style={{ width: totalWidth, position: 'relative' }}>
          <div
            className="sticky top-0 z-10 flex bg-zinc-900 text-xs font-semibold uppercase tracking-wide text-zinc-400"
            style={{ height: ROW_HEIGHT, borderBottom: '1px solid rgb(39 39 42)' }}
          >
            <div className="grid place-items-center" style={{ width: 56 }}>#</div>
            {columns.map((c, i) => (
              <div
                key={c}
                className="flex items-center border-l border-zinc-800 px-3"
                style={{ width: colWidths[i] }}
                title={c}
              >
                <span className="truncate">{c}</span>
              </div>
            ))}
          </div>
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((vRow) => {
              const row = buffer[vRow.index];
              return (
                <div
                  key={vRow.key}
                  className="absolute left-0 flex border-b border-zinc-800 text-sm"
                  style={{
                    top: 0, transform: `translateY(${vRow.start}px)`,
                    height: ROW_HEIGHT, width: totalWidth,
                  }}
                >
                  <div className="grid place-items-center text-xs text-zinc-500" style={{ width: 56 }}>
                    {vRow.index + 1}
                  </div>
                  {columns.map((col, i) => (
                    <EditableCell
                      key={col}
                      row={row}
                      column={col}
                      width={colWidths[i] ?? 180}
                      onCommit={(value) => {
                        if (!row) return;
                        if (row.data[col] === value) return;
                        updateCell.mutate({ rowId: row.id, column: col, value });
                      }}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function EditableCell({
  row,
  column,
  width,
  onCommit,
}: {
  row: SpreadsheetRow | undefined;
  column: string;
  width: number;
  onCommit: (value: CellValue) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  if (!row) {
    return (
      <div className="border-l border-zinc-800 px-3 text-zinc-700" style={{ width }}>
        …
      </div>
    );
  }
  const current = row.data[column];
  const display = current === null || current === undefined ? '' : String(current);

  const beginEdit = () => {
    setDraft(display);
    setEditing(true);
  };

  if (!editing) {
    return (
      <div
        className="group relative cursor-text border-l border-zinc-800 px-3 leading-[32px] text-zinc-200 hover:bg-zinc-800/40"
        style={{ width }}
        title="Click to edit"
        onClick={beginEdit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'F2') beginEdit();
        }}
        tabIndex={0}
      >
        {display === '' ? (
          <span className="block text-zinc-600 group-hover:text-zinc-400">empty</span>
        ) : (
          <span className="block truncate">{display}</span>
        )}
      </div>
    );
  }

  return (
    <div className="border-l border-zinc-800" style={{ width }}>
      <input
        autoFocus
        // Select the existing text on the FIRST focus only. A ref callback that
        // called .select() ran on every keystroke (re-render) and erased what
        // the user just typed — single-letter overwrite bug.
        onFocus={(e) => e.currentTarget.select()}
        className="h-full w-full bg-zinc-950 px-3 text-sm text-zinc-100 outline-none ring-1 ring-indigo-500"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { setEditing(false); onCommit(coerceLike(current, draft)); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.currentTarget.blur(); }
          if (e.key === 'Escape') { setDraft(display); setEditing(false); }
        }}
      />
    </div>
  );
}

/**
 * Keep the cell's original primitive type when committing — entering "12" into
 * a numeric column should round-trip as a number, not as "12".
 */
function coerceLike(original: CellValue, raw: string): CellValue {
  if (raw === '') return null;
  if (typeof original === 'number' && /^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  if (typeof original === 'boolean') {
    if (raw.toLowerCase() === 'true') return true;
    if (raw.toLowerCase() === 'false') return false;
  }
  return raw;
}
