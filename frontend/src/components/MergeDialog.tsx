import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { sheetsApi, Spreadsheet } from '../api/spreadsheets';

export function MergeDialog({
  sheets,
  selectedIds,
  onClose,
}: {
  sheets: Spreadsheet[];
  selectedIds: string[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [name, setName] = useState('merged');
  const [strategy, setStrategy] = useState<'append' | 'join'>('append');
  const [joinOn, setJoinOn] = useState<string>('');
  const [consume, setConsume] = useState(false);

  const sources = sheets.filter((s) => selectedIds.includes(s.id));
  const commonColumns = useMemo(() => {
    if (sources.length === 0) return [];
    return sources[0]!.columns.filter((c) => sources.every((s) => s.columns.includes(c)));
  }, [sources]);

  const merge = useMutation({
    mutationFn: () => sheetsApi.merge({
      name,
      strategy,
      joinOn: strategy === 'join' ? joinOn : undefined,
      sources: selectedIds,
      consumeSources: consume,
    }),
    onSuccess: async (created) => {
      await qc.invalidateQueries({ queryKey: ['sheets'] });
      onClose();
      nav(`/sheets/${created.id}`);
    },
  });

  const canMerge = selectedIds.length >= 2 && name.trim().length > 0 &&
    (strategy === 'append' || (strategy === 'join' && joinOn.length > 0));

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <div className="card w-full max-w-md p-5">
        <h2 className="text-lg font-semibold">Merge {selectedIds.length} files</h2>

        <label className="mt-4 block text-sm">
          <span className="text-zinc-300">Result name</span>
          <input className="input mt-1" value={name} maxLength={120}
            onChange={(e) => setName(e.target.value)} />
        </label>

        <fieldset className="mt-4">
          <legend className="text-sm text-zinc-300">Strategy</legend>
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <label className={`card cursor-pointer p-3 ${strategy === 'append' ? 'border-indigo-500 bg-indigo-500/5' : ''}`}>
              <input type="radio" className="sr-only" name="strategy" value="append"
                checked={strategy === 'append'} onChange={() => setStrategy('append')} />
              <div className="font-medium">Append</div>
              <div className="text-xs text-zinc-500">Stack rows under a unified column set</div>
            </label>
            <label className={`card cursor-pointer p-3 ${strategy === 'join' ? 'border-indigo-500 bg-indigo-500/5' : ''}`}>
              <input type="radio" className="sr-only" name="strategy" value="join"
                checked={strategy === 'join'} onChange={() => setStrategy('join')} />
              <div className="font-medium">Join by column</div>
              <div className="text-xs text-zinc-500">Match rows by a shared key (e.g. student ID)</div>
            </label>
          </div>
        </fieldset>

        {strategy === 'join' && (
          <label className="mt-4 block text-sm">
            <span className="text-zinc-300">Join column</span>
            <select className="input mt-1" value={joinOn} onChange={(e) => setJoinOn(e.target.value)}>
              <option value="">— pick a column —</option>
              {commonColumns.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            {strategy === 'join' && commonColumns.length === 0 && (
              <span className="mt-1 block text-xs text-amber-300">
                The selected files share no common columns.
              </span>
            )}
          </label>
        )}

        <label className="mt-4 flex items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" checked={consume} onChange={(e) => setConsume(e.target.checked)} />
          Delete source files after merge
        </label>

        {merge.isError && (
          <div className="mt-3 rounded-md bg-rose-950/60 px-3 py-2 text-sm text-rose-200">
            {(merge.error as Error).message}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={!canMerge || merge.isPending}
            onClick={() => merge.mutate()}>
            {merge.isPending ? 'Merging…' : 'Merge'}
          </button>
        </div>
      </div>
    </div>
  );
}
