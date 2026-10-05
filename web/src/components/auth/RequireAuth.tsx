import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { AuthLoading } from "@/components/auth/AuthLoading";
import { useAuth } from "@/providers/AuthProvider";

/** Gate for every game route: waits for the session, then sends signed-out players to /auth. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isReady, isRecovery } = useAuth();
  const location = useLocation();

  if (!isReady) return <AuthLoading />;
  if (!user || isRecovery) {
    return <Navigate to="/auth" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }
  return <>{children}</>;
}
