import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';

export function ProtectedRoute({
  children,
  requirePermission,
}: {
  children: React.ReactNode;
  requirePermission?: string;
}) {
  const { status, hasPermission } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div className="grid h-full place-items-center text-zinc-400">
        <div className="animate-pulse">Loading session…</div>
      </div>
    );
  }
  if (status === 'guest') {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  if (requirePermission && !hasPermission(requirePermission)) {
    return (
      <div className="grid h-full place-items-center">
        <div className="card max-w-md p-6 text-center">
          <h2 className="text-lg font-semibold text-zinc-100">Access denied</h2>
          <p className="mt-2 text-sm text-zinc-400">
            You don't have permission to view this page (<code className="text-zinc-300">{requirePermission}</code>).
          </p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
