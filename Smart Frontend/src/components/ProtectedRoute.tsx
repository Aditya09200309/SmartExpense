import { Navigate } from 'react-router-dom';
import { clearStoredSession, isTokenValid, readStoredToken } from '../lib/session';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = readStoredToken();

  if (!token || !isTokenValid(token)) {
    clearStoredSession();
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
