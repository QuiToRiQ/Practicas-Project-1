import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { adminApi } from '../../api/admin';
import { ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthProvider';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card mt-4 p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">{title}</h2>
      <div className="mt-3">{children}</div>
    </div>
  );
}

export function AdminUserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const nav = useNavigate();
  const { session } = useAuth();
  const isSelf = session?.user.id === id;

  const userQ = useQuery({
    queryKey: ['admin', 'users', id],
    queryFn: () => adminApi.getUser(id!),
    enabled: !!id,
  });
  const rolesQ = useQuery({ queryKey: ['admin', 'roles'], queryFn: adminApi.listRoles });

  // Form state mirrors the server-side record once loaded.
  const [displayName, setDisplayName] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (userQ.data) {
      setDisplayName(userQ.data.displayName ?? '');
      setIsActive(userQ.data.isActive);
      setSelectedRoles(userQ.data.roleNames);
    }
  }, [userQ.data]);

  function bust() {
    void qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    void qc.invalidateQueries({ queryKey: ['admin', 'stats'] });
  }

  const saveProfile = useMutation({
    mutationFn: () => adminApi.updateUser(id!, {
      displayName: displayName.trim() === '' ? null : displayName.trim(),
      isActive,
    }),
    onSuccess: bust,
    onError: (e: Error) => setError(e.message),
  });

  const saveRoles = useMutation({
    mutationFn: () => adminApi.setRoles(id!, selectedRoles),
    onSuccess: bust,
    onError: (e: Error) => setError(e.message),
  });

  const resetPwd = useMutation({
    mutationFn: () => adminApi.resetPassword(id!, newPassword),
    onSuccess: () => { setNewPassword(''); bust(); },
    onError: (e: Error) => setError(e.message),
  });

  const forceLogout = useMutation({
    mutationFn: () => adminApi.forceLogout(id!),
    onError: (e: Error) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: () => adminApi.deleteUser(id!),
    onSuccess: () => { bust(); nav('/admin/users'); },
    onError: (e: Error) => setError(e instanceof ApiError ? e.message : String(e)),
  });

  function toggleRole(name: string) {
    setError(null);
    setSelectedRoles((s) => s.includes(name) ? s.filter((r) => r !== name) : [...s, name]);
  }

  if (!id) return null;
  if (userQ.isError) return <div className="p-6 text-rose-300">User not found.</div>;
  if (!userQ.data) return <div className="p-6 text-zinc-400">Loading…</div>;

  return (
    <div className="mx-auto max-w-3xl p-6">
      <Link to="/admin/users" className="btn-ghost mb-3">← All users</Link>
      <h1 className="text-xl font-semibold">{userQ.data.email}</h1>
      <p className="mt-1 text-xs text-zinc-500">
        User id: <code>{userQ.data.id}</code>
        {isSelf && <span className="ml-2 rounded bg-amber-500/20 px-2 py-0.5 text-amber-200">you</span>}
      </p>

      {error && (
        <div className="mt-3 rounded-md bg-rose-950/60 px-3 py-2 text-sm text-rose-200">{error}</div>
      )}

      <Section title="Profile">
        <label className="block text-sm">
          <span className="text-zinc-300">Display name</span>
          <input
            className="input mt-1" maxLength={120}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </label>
        <label className="mt-3 flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox" checked={isActive}
            disabled={isSelf}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          Active {isSelf && <span className="text-xs text-zinc-500">(can't deactivate yourself)</span>}
        </label>
        <div className="mt-4">
          <button className="btn-primary" disabled={saveProfile.isPending}
            onClick={() => { setError(null); saveProfile.mutate(); }}>
            {saveProfile.isPending ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </Section>

      <Section title="Roles">
        <div className="space-y-2">
          {rolesQ.data?.map((r) => {
            const checked = selectedRoles.includes(r.name);
            const cannotRemoveAdmin = isSelf && r.name === 'admin' && checked;
            return (
              <label key={r.name} className={`card flex cursor-pointer items-start gap-3 p-3 ${cannotRemoveAdmin ? 'opacity-70' : ''}`}>
                <input
                  type="checkbox" className="mt-1"
                  checked={checked}
                  disabled={cannotRemoveAdmin}
                  onChange={() => toggleRole(r.name)}
                />
                <div>
                  <div className="font-medium text-zinc-100">{r.name}</div>
                  {r.description && <div className="text-xs text-zinc-500">{r.description}</div>}
                  <div className="mt-1 flex flex-wrap gap-1">
                    {r.permissionCodes.map((c) => (
                      <span key={c} className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-300">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
        <div className="mt-4">
          <button className="btn-primary" disabled={saveRoles.isPending}
            onClick={() => { setError(null); saveRoles.mutate(); }}>
            {saveRoles.isPending ? 'Saving…' : 'Save roles'}
          </button>
        </div>
      </Section>

      <Section title="Reset password">
        <p className="text-xs text-zinc-500">
          Sets a new password and signs the user out of every device. Tell them out-of-band.
        </p>
        <label className="mt-3 block text-sm">
          <span className="text-zinc-300">New password <span className="text-zinc-500">(min 12 chars)</span></span>
          <input
            className="input mt-1" type="password" minLength={12} maxLength={256}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </label>
        <div className="mt-3">
          <button className="btn-primary" disabled={newPassword.length < 12 || resetPwd.isPending}
            onClick={() => { setError(null); resetPwd.mutate(); }}>
            {resetPwd.isPending ? 'Resetting…' : 'Reset password'}
          </button>
        </div>
      </Section>

      <Section title="Sessions">
        <p className="text-xs text-zinc-500">
          Revoke all of this user's refresh tokens. They'll have to sign in again on every device.
        </p>
        <div className="mt-3">
          <button className="btn-ghost" disabled={forceLogout.isPending}
            onClick={() => { setError(null); forceLogout.mutate(); }}>
            {forceLogout.isPending ? 'Revoking…' : 'Force logout'}
          </button>
          {forceLogout.isSuccess && (
            <span className="ml-3 text-xs text-emerald-300">Sessions revoked.</span>
          )}
        </div>
      </Section>

      <Section title="Delete user">
        <p className="text-xs text-rose-300">
          Permanently deletes this user and all their spreadsheets. Cannot be undone (use `make restore` if you change your mind).
        </p>
        <div className="mt-3">
          <button
            className="btn-danger"
            disabled={isSelf || remove.isPending}
            onClick={() => {
              if (!confirm(`Permanently delete ${userQ.data?.email} and all their data?`)) return;
              setError(null); remove.mutate();
            }}
          >
            {remove.isPending ? 'Deleting…' : isSelf ? 'Cannot delete yourself' : 'Delete user'}
          </button>
        </div>
      </Section>
    </div>
  );
}
