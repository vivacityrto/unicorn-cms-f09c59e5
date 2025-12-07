import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import PackageDetail from './PackageDetail';

export default function PackageDetailWrapper() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <PackageDetail />;
}
