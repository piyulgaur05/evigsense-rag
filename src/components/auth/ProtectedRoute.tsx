import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";

function Waiting() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

/**
 * Sends anyone without a session to sign-in, remembering where they were headed.
 * `signInPath` matters because the app has two doors: the document workspace
 * signs in at /auth, the procurement portal at its own page.
 */
export function ProtectedRoute({
  children,
  signInPath = "/auth",
}: {
  children: ReactNode;
  signInPath?: string;
}) {
  const { loading, session } = useAuth();
  const location = useLocation();

  if (loading) return <Waiting />;
  if (!session) return <Navigate to={signInPath} replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

/**
 * Gate on a procurement permission key. Signing in is handled by
 * ProtectedRoute; someone signed in but without the key is told so rather than
 * bounced, so a wrong link reads as a permissions problem, not a broken app.
 */
export function RequirePermission({
  permission,
  children,
  signInPath,
  deniedHint,
}: {
  permission: string | string[];
  children: ReactNode;
  signInPath?: string;
  deniedHint?: string;
}) {
  return (
    <ProtectedRoute signInPath={signInPath}>
      <PermissionGate permission={permission} deniedHint={deniedHint}>
        {children}
      </PermissionGate>
    </ProtectedRoute>
  );
}

function PermissionGate({
  permission,
  children,
  deniedHint,
}: {
  permission: string | string[];
  children: ReactNode;
  deniedHint?: string;
}) {
  const { can } = useAuth();
  const keys = Array.isArray(permission) ? permission : [permission];

  if (!keys.some((key) => can(key))) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="max-w-md rounded-lg border border-border bg-card p-6 text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            no access
          </p>
          <h1 className="mt-3 font-display text-[1.5rem] text-foreground">
            This desk is not yours
          </h1>
          <p className="mt-2 text-[14px] text-muted-foreground">
            {deniedHint ??
              "Your account has no procurement role that covers this page. An administrator can grant one."}
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
