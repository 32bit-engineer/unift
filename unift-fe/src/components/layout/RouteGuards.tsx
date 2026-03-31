import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';

/**
 * Route guard that redirects unauthenticated users to /login.
 * Wraps protected route groups as a layout route.
 */
export function ProtectedRoute() {
  const { isAuthenticated } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Outlet />;
}

/**
 * Reverse guard — redirects authenticated users away from /login.
 */
export function PublicOnlyRoute() {
  const { isAuthenticated } = useAuthStore();
  if (isAuthenticated) return <Navigate to="/" replace />;
  return <Outlet />;
}
