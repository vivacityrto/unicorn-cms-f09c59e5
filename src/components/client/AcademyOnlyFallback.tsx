import { GraduationCap } from "lucide-react";
import { Link } from "react-router-dom";

export function AcademyOnlyFallback() {
  return (
    <div className="flex items-center justify-center min-h-[60vh] p-6">
      <div className="max-w-md text-center space-y-4">
        <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
          <GraduationCap className="w-6 h-6 text-muted-foreground" />
        </div>
        <h1 className="text-xl font-semibold">Academy access only</h1>
        <p className="text-sm text-muted-foreground">
          Your account has access to Vivacity Academy only. If you need access to other parts of the
          client portal, please ask your organisation's primary contact to update your permissions.
        </p>
        <Link
          to="/client/academy"
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Go to Academy
        </Link>
      </div>
    </div>
  );
}
