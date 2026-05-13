import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../../api/admin';

const PAGE_SIZE = 25;

export function AdminUsersPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  const usersQ = useQuery({
    queryKey: ['admin', 'users', search, page],
    queryFn: () => adminApi.listUsers({
      search: search.trim() || undefined,
      offset: page * PAGE_SIZE,
      limit: PAGE_SIZE,
    }),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Users</h1>
        <input
          className="input max-w-xs"
          placeholder="Search email or display name…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
        />
      </div>

      <div className="card mt-4 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-2 text-left">Email</th>
              <th className="px-4 py-2 text-left">Display name</th>
              <th className="px-4 py-2 text-left">Roles</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">Joined</th>
            </tr>
          </thead>
          <tbody>
            {usersQ.data?.users.map((u) => (
              <tr key={u.id} className="border-t border-zinc-800 hover:bg-zinc-900/50">
                <td className="px-4 py-2">
                  <Link to={`/admin/users/${u.id}`} className="text-indigo-300 hover:underline">
                    {u.email}
                  </Link>
                </td>
                <td className="px-4 py-2 text-zinc-300">{u.displayName || '—'}</td>
                <td className="px-4 py-2">
                  <div className="flex flex-wrap gap-1">
                    {u.roleNames.map((r) => (
                      <span key={r} className="rounded bg-zinc-800 px-2 py-0.5 text-xs">
                        {r}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-2">
                  {u.isActive ? (
                    <span className="text-emerald-400">active</span>
                  ) : (
                    <span className="text-zinc-500">disabled</span>
                  )}
                </td>
                <td className="px-4 py-2 text-zinc-500">
                  {new Date(u.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
            {usersQ.data && usersQ.data.users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-zinc-500">
                  No users match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {usersQ.data && (
        <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
          <span>
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, usersQ.data.total)} of {usersQ.data.total}
          </span>
          <div className="flex gap-2">
            <button className="btn-ghost" disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}>← Prev</button>
            <button className="btn-ghost"
              disabled={(page + 1) * PAGE_SIZE >= usersQ.data.total}
              onClick={() => setPage((p) => p + 1)}>Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}
