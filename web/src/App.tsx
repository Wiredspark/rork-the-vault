import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { useEffect } from "react";

import { AdminLayout } from "@/components/admin/AdminLayout";
import { ProtectedLayout } from "@/components/auth/ProtectedLayout";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/providers/AuthProvider";

import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import NotFound from "./pages/NotFound";
import Play from "./pages/Play";
import Results from "./pages/Results";
import VaultChamber from "./pages/VaultChamber";
import ArenaLobby from "./pages/arena/ArenaLobby";
import ArenaRoom from "./pages/arena/ArenaRoom";
import TournamentDetail from "./pages/arena/TournamentDetail";
import Tournaments from "./pages/arena/Tournaments";
import AdminTournaments from "./pages/admin/AdminTournaments";
import AdminArena from "./pages/admin/AdminArena";
import AdminEpisodeEditor from "./pages/admin/AdminEpisodeEditor";
import AdminEpisodes from "./pages/admin/AdminEpisodes";
import AdminLogin from "./pages/admin/AdminLogin";
import AdminRoles from "./pages/admin/AdminRoles";

const queryClient = new QueryClient();

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);
  return null;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster position="top-center" />
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <ScrollToTop />
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<AdminEpisodes />} />
              <Route path="episodes/:id" element={<AdminEpisodeEditor />} />
              <Route path="roles" element={<AdminRoles />} />
              <Route path="arena" element={<AdminArena />} />
              <Route path="tournaments" element={<AdminTournaments />} />
            </Route>
            <Route element={<ProtectedLayout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/play" element={<Play />} />
              <Route path="/vault" element={<VaultChamber />} />
              <Route path="/results" element={<Results />} />
              <Route path="/arena" element={<ArenaLobby />} />
              <Route path="/arena/room/:roomId" element={<ArenaRoom />} />
              <Route path="/arena/tournaments" element={<Tournaments />} />
              <Route path="/arena/tournaments/:id" element={<TournamentDetail />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
