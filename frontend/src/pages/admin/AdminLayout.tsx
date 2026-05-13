import { NavLink, Outlet } from 'react-router-dom';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `block rounded-md px-3 py-1.5 text-sm transition-colors ${
    isActive
      ? 'bg-indigo-500/20 text-indigo-200'
      : 'text-zinc-300 hover:bg-zinc-800'
  }`;

export function AdminLayout() {
  return (
    <div className="grid h-full grid-cols-[200px_1fr]">
      <aside className="border-r border-zinc-800 bg-zinc-950/60 p-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Admin
        </div>
        <nav className="space-y-1">
          <NavLink to="/admin" end className={linkClass}>Overview</NavLink>
          <NavLink to="/admin/users" className={linkClass}>Users</NavLink>
          <NavLink to="/admin/roles" className={linkClass}>Roles &amp; permissions</NavLink>
        </nav>
      </aside>
      <section className="overflow-y-auto">
        <Outlet />
      </section>
    </div>
  );
}
