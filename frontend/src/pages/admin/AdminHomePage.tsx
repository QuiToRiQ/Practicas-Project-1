import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../../api/admin';

function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="card p-5">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-2 text-3xl font-semibold text-zinc-100">{value}</div>
      {hint && <div className="mt-1 text-xs text-zinc-500">{hint}</div>}
    </div>
  );
}

export function AdminHomePage() {
  const q = useQuery({ queryKey: ['admin', 'stats'], queryFn: adminApi.stats });

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="text-xl font-semibold">System overview</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Current counts. Refreshes whenever you navigate back to this page.
      </p>

      {q.isError && (
        <div className="card mt-4 p-4 text-rose-300">Failed to load stats.</div>
      )}

      {q.data && (
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3">
          <StatCard
            label="Users"
            value={q.data.userCount}
            hint={`${q.data.activeUserCount} active`}
          />
          <StatCard label="Admins" value={q.data.adminCount} />
          <StatCard label="Spreadsheets" value={q.data.sheetCount} />
          <StatCard
            label="Total rows"
            value={q.data.totalRowCount.toLocaleString()}
            hint="sum across all sheets"
          />
        </div>
      )}
    </div>
  );
}
