import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * ProfileRedirect component that redirects /profile to /user-profile/:userId
 * using the current authenticated user's ID.
 */
export default function ProfileRedirect() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      if (user?.id) {
        // Redirect to the user's own profile page
        navigate(`/user-profile/${user.id}`, { replace: true });
      } else {
        // Not authenticated, redirect to auth
        navigate('/auth', { replace: true });
      }
    }
  }, [user, loading, navigate]);

  // Show loading state while checking auth
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="space-y-4 text-center">
        <Skeleton className="h-12 w-48 mx-auto" />
        <p className="text-muted-foreground">Loading profile...</p>
      </div>
    </div>
  );
}
