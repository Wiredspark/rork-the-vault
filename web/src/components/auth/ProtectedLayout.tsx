import { Outlet } from "react-router-dom";

import { RequireAuth } from "@/components/auth/RequireAuth";
import { AppShell } from "@/components/shell/AppShell";
import { useAuth } from "@/providers/AuthProvider";
import { GameProvider } from "@/providers/GameProvider";
import { ShellUIProvider } from "@/providers/ShellUIProvider";

function SignedInGame() {
  const { user } = useAuth();
  // Keyed by account so switching players remounts game state from that player's own saved runs.
  return (
    <GameProvider key={user?.id ?? "none"}>
      <ShellUIProvider>
        <AppShell>
          <Outlet />
        </AppShell>
      </ShellUIProvider>
    </GameProvider>
  );
}

/** Layout route for every game screen: requires a session, then mounts the player's game state and shell. */
export function ProtectedLayout() {
  return (
    <RequireAuth>
      <SignedInGame />
    </RequireAuth>
  );
}
