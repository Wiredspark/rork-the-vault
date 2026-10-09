import createContextHook from "@nkzw/create-context-hook";
import { useCallback, useMemo, useRef, useState } from "react";

export type BoardScope = "all" | "week" | "episode";
export type BoardSection = "standings" | "stats" | "arena";

/**
 * Shell-level overlay state (drawer, leaderboard, streak guide, episode picker) so the
 * drawer menu can open any dashboard section from anywhere in the app.
 */
export const [ShellUIProvider, useShellUI] = createContextHook(() => {
  const [menuOpen, setMenuOpen] = useState<boolean>(false);
  const [boardOpen, setBoardOpen] = useState<boolean>(false);
  const [boardScope, setBoardScope] = useState<BoardScope>("all");
  const [boardSection, setBoardSection] = useState<BoardSection>("standings");
  const [streakOpen, setStreakOpen] = useState<boolean>(false);
  const [pickerOpen, setPickerOpen] = useState<boolean>(false);
  // Overlays launched from the drawer open only after it finishes closing, so the
  // drawer's focus-return doesn't immediately dismiss the new overlay. On desktop
  // the rail is persistent (menu never opens), so these fire straight away.
  const afterMenuClose = useRef<(() => void) | null>(null);

  const openLeaderboard = useCallback((section: BoardSection = "standings", scope?: BoardScope) => {
    if (scope) setBoardScope(scope);
    setBoardSection(section);
    setBoardOpen(true);
  }, []);

  const runAfterMenuClose = useCallback(
    (fn: () => void) => {
      if (!menuOpen) {
        fn();
        return;
      }
      afterMenuClose.current = fn;
      setMenuOpen(false);
    },
    [menuOpen],
  );

  /** Called from the drawer's onCloseAutoFocus. Returns true when a pending overlay took over focus. */
  const flushAfterMenuClose = useCallback((): boolean => {
    const fn = afterMenuClose.current;
    afterMenuClose.current = null;
    if (!fn) return false;
    fn();
    return true;
  }, []);

  return useMemo(
    () => ({
      menuOpen,
      setMenuOpen,
      boardOpen,
      setBoardOpen,
      boardScope,
      setBoardScope,
      boardSection,
      openLeaderboard,
      streakOpen,
      setStreakOpen,
      pickerOpen,
      setPickerOpen,
      runAfterMenuClose,
      flushAfterMenuClose,
    }),
    [boardOpen, boardScope, boardSection, flushAfterMenuClose, menuOpen, openLeaderboard, pickerOpen, runAfterMenuClose, streakOpen],
  );
});
