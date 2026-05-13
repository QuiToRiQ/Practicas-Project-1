import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';

export function Layout() {
  const { session, logout, hasPermission } = useAuth();
  const nav = useNavigate();

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-zinc-800 bg-zinc-950/80 px-5 py-3 backdrop-blur">
        <div className="flex items-center gap-4">
          <Link to="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <span className="inline-block h-2 w-2 rounded-full bg-indigo-400" />
            practicas
          </Link>
          {hasPermission('users:admin') && (
            <Link
              to="/admin"
              className="text-xs text-zinc-400 hover:text-zinc-100"
            >
              Admin
            </Link>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-zinc-400">
          {session && <span>{session.user.displayName || session.user.email}</span>}
          <button
            className="btn-ghost"
            onClick={async () => { await logout(); nav('/login'); }}
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
