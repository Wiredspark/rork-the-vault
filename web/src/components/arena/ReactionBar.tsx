import { memo } from "react";

import type { ArenaReactionEvent } from "@/hooks/use-arena-room";
import { ARENA_REACTIONS, type Reaction } from "@/lib/arena/protocol";
import { cn } from "@/lib/utils";

/** Quick emoji reactions plus the floating bubbles everyone in the room sees. */
export const ReactionBar = memo(function ReactionBar({
  reactions,
  onReact,
  disabled,
  className,
}: {
  reactions: ArenaReactionEvent[];
  onReact: (emoji: Reaction) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <div className="pointer-events-none absolute inset-x-0 bottom-full h-40 overflow-visible" aria-live="polite">
        {reactions.map((r) => (
          <span
            key={r.id}
            className="absolute bottom-0 flex animate-float-up flex-col items-center"
            style={{ left: `${8 + ((r.id * 37) % 80)}%` }}
          >
            <span className="text-[28px] leading-none">{r.emoji}</span>
            <span className="mt-0.5 max-w-[90px] truncate rounded-full bg-vault-ink/80 px-1.5 font-mono text-[9px] text-vault-ice/70">{r.name}</span>
          </span>
        ))}
      </div>
      <div className="flex items-center justify-center gap-1.5 rounded-full border border-vault-line bg-vault-panel/90 p-1.5" role="group" aria-label="Send a reaction">
        {ARENA_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            disabled={disabled}
            onClick={() => onReact(emoji)}
            className="flex h-10 w-10 items-center justify-center rounded-full text-[20px] transition-transform hover:scale-110 hover:bg-white/[0.05] active:scale-90 disabled:opacity-30"
            aria-label={`React ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
});
