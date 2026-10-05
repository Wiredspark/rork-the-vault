import { useQuery } from "@tanstack/react-query";
import { Check, Copy, Download, ImageIcon, Loader2, Share2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { buildShareText, renderShareCard, type ShareCardData } from "@/lib/shareCard";
import { cn } from "@/lib/utils";

interface ShareRankDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: ShareCardData;
}

const BTN =
  "flex h-11 items-center justify-center gap-2 rounded-lg border px-3 text-[13.5px] font-medium transition-[transform,background-color,border-color] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vault-neon/60" as const;
const BTN_GHOST = "border-vault-line bg-vault-panel text-vault-ice hover:border-vault-neon/40 hover:bg-vault-raised" as const;

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/** Share sheet for the leaderboard: a rendered rank card image plus a copyable text snippet. */
export function ShareRankDialog({ open, onOpenChange, data }: ShareRankDialogProps) {
  const text = useMemo(() => buildShareText(data), [data]);
  const [copied, setCopied] = useState<"text" | "image" | null>(null);

  const card = useQuery({
    queryKey: ["share-card", data],
    queryFn: () => renderShareCard(data),
    enabled: open,
    staleTime: Infinity,
    gcTime: 60_000,
    retry: false,
  });
  const blob = card.data ?? null;

  const previewUrl = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(null), 1800);
    return () => window.clearTimeout(id);
  }, [copied]);

  const fileName = `the-vault-rank-${data.scopeLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}.png`;
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const canCopyImage = typeof navigator !== "undefined" && Boolean(navigator.clipboard?.write) && typeof ClipboardItem !== "undefined";

  const copyText = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied("text");
      toast.success("Snippet copied", { description: "Paste it anywhere to show off your rank." });
    } catch {
      toast.error("Couldn't copy", { description: "Your browser blocked clipboard access." });
    }
  }, [text]);

  const copyImage = useCallback(async () => {
    if (!blob) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setCopied("image");
      toast.success("Image copied");
    } catch {
      toast.error("Couldn't copy the image", { description: "Try Save image instead." });
    }
  }, [blob]);

  const download = useCallback(() => {
    if (!previewUrl) return;
    const a = document.createElement("a");
    a.href = previewUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [fileName, previewUrl]);

  const share = useCallback(async () => {
    try {
      if (blob) {
        const file = new File([blob], fileName, { type: "image/png" });
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: "My rank in The Vault", text });
          return;
        }
      }
      await navigator.share({ title: "My rank in The Vault", text });
    } catch (error) {
      if (isAbort(error)) return;
      await copyText();
    }
  }, [blob, copyText, fileName, text]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[94vh] max-w-md flex-col gap-0 overflow-hidden border-vault-neon/20 bg-[linear-gradient(180deg,#141D19,#0F1613)] p-0 text-vault-ice">
        <DialogHeader className="gap-1.5 border-b border-vault-neon/15 px-5 pb-4 pt-5 text-left">
          <DialogTitle className="flex items-center gap-2.5 font-display text-lg font-medium text-vault-ice">
            <Share2 className="h-5 w-5 text-vault-neon" aria-hidden="true" />
            Share your rank
          </DialogTitle>
          <DialogDescription className="vault-kicker text-[11px]">{data.scopeLabel} · image card or text snippet</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 pb-5 pt-4">
          <div className="relative mx-auto aspect-[4/5] w-full max-w-[300px] overflow-hidden rounded-xl border border-vault-neon/25 bg-vault-ink shadow-[0_20px_60px_-20px_rgba(207,171,92,0.35)]">
            {previewUrl ? (
              <img src={previewUrl} alt={`Rank card: ${text.split("\n")[1] ?? ""}`} className="h-full w-full animate-in fade-in zoom-in-95 object-cover duration-300 motion-reduce:animate-none" />
            ) : card.isError ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center" role="alert">
                <ImageIcon className="h-6 w-6 text-vault-danger" aria-hidden="true" />
                <p className="text-[13px] text-vault-ice/80">The card couldn't be drawn. The text snippet still works.</p>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center gap-2 text-vault-muted" role="status">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                <span className="vault-kicker text-[11px]">Minting your card</span>
              </div>
            )}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {canNativeShare && (
              <button
                type="button"
                onClick={share}
                disabled={card.isPending && open}
                className={cn(BTN, "col-span-2 border-vault-neon/60 bg-vault-neon text-vault-ink hover:bg-vault-neonhi")}
              >
                <Share2 className="h-4 w-4" aria-hidden="true" />
                Share
              </button>
            )}
            <button type="button" onClick={download} disabled={!previewUrl} className={cn(BTN, BTN_GHOST)}>
              <Download className="h-4 w-4 text-vault-neon" aria-hidden="true" />
              Save image
            </button>
            {canCopyImage ? (
              <button type="button" onClick={copyImage} disabled={!blob} className={cn(BTN, BTN_GHOST)}>
                {copied === "image" ? <Check className="h-4 w-4 text-vault-success" aria-hidden="true" /> : <ImageIcon className="h-4 w-4 text-vault-neon" aria-hidden="true" />}
                {copied === "image" ? "Copied" : "Copy image"}
              </button>
            ) : (
              <button type="button" onClick={copyText} className={cn(BTN, BTN_GHOST)}>
                {copied === "text" ? <Check className="h-4 w-4 text-vault-success" aria-hidden="true" /> : <Copy className="h-4 w-4 text-vault-neon" aria-hidden="true" />}
                {copied === "text" ? "Copied" : "Copy text"}
              </button>
            )}
          </div>

          <div className="mt-4 rounded-lg border border-vault-line bg-vault-ink/60">
            <div className="flex items-center justify-between border-b border-vault-line px-3 py-2">
              <span className="hud-label text-[9.5px]">Text snippet</span>
              <button
                type="button"
                onClick={copyText}
                className="flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[10.5px] uppercase tracking-[0.14em] text-vault-neon transition-colors hover:bg-vault-neon/10"
              >
                {copied === "text" ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
                {copied === "text" ? "Copied" : "Copy"}
              </button>
            </div>
            <pre className="whitespace-pre-wrap break-words px-3 py-2.5 font-mono text-[11.5px] leading-relaxed text-vault-ice/80">{text}</pre>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
