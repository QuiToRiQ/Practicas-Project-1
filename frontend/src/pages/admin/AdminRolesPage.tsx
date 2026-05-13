import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../../api/admin';

export function AdminRolesPage() {
  const q = useQuery({ queryKey: ['admin', 'roles'], queryFn: adminApi.listRoles });

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="text-xl font-semibold">Roles &amp; permissions</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Roles are seeded from code (<code>permissions.seeder.ts</code>). To add or
        edit a role, modify that file and redeploy — this view is read-only.
      </p>

      {q.isError && (
        <div className="card mt-4 p-4 text-rose-300">Failed to load roles.</div>
      )}

      <div className="mt-5 space-y-3">
        {q.data?.map((r) => (
          <div key={r.name} className="card p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">{r.name}</h2>
              <span className="text-xs text-zinc-500">
                {r.permissionCodes.length} permission{r.permissionCodes.length === 1 ? '' : 's'}
              </span>
            </div>
            {r.description && <p className="mt-1 text-sm text-zinc-400">{r.description}</p>}
            <div className="mt-3 flex flex-wrap gap-1">
              {r.permissionCodes.map((c) => (
                <span key={c} className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-200">
                  {c}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
