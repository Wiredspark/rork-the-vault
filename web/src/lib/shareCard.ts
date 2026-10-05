import { formatAccuracy, type CareerStats } from "@/lib/careerStats";
import { formatMoney } from "@/lib/scoring";

/** Everything the share snippet and share image need: the player's rank plus career stats for one scope. */
export interface ShareCardData {
  playerName: string;
  moduleName: string;
  /** "All Time", "This Week", or "EP003 · Title". */
  scopeLabel: string;
  rank: number | null;
  totalPlayers: number;
  stats: CareerStats;
  isEpisodeScope: boolean;
  bestRunEpisodeId: string | null;
  url: string;
}

const W = 1080;
const H = 1350;
const PAD = 96;

const C = {
  ink: "#0B1210",
  gold: "#CFAB5C",
  goldHi: "#EAD9A8",
  goldDeep: "#9A7B3F",
  ivory: "#F1EEE3",
  muted: "#8C948B",
} as const;

const FONT_DISPLAY = '"Unbounded", "DM Mono", sans-serif';
const FONT_BODY = '"Manrope", system-ui, sans-serif';
const FONT_MONO = '"DM Mono", ui-monospace, monospace';

/** Top-X% bucket for a rank; never below 1%. */
export function percentileFor(rank: number | null, totalPlayers: number): number | null {
  if (rank === null || totalPlayers <= 0) return null;
  return Math.max(1, Math.ceil((rank / totalPlayers) * 100));
}

/** Plain-text snippet for chats and socials. */
export function buildShareText(data: ShareCardData): string {
  const pct = percentileFor(data.rank, data.totalPlayers);
  const { stats } = data;
  const rankLine =
    data.rank !== null
      ? `${data.playerName}: #${data.rank} of ${data.totalPlayers.toLocaleString("en-US")} players${pct !== null ? ` (Top ${pct}%)` : ""} · ${data.scopeLabel}`
      : `${data.playerName}: unranked · ${data.scopeLabel}, chasing the top 10`;
  const statsLine = [
    formatMoney(stats.totalVc),
    `${stats.cracked} ${stats.cracked === 1 ? "vault" : "vaults"} cracked`,
    `${formatAccuracy(stats.accuracy)} accuracy`,
    `peak streak ${stats.peakStreak}`,
  ].join(" · ");
  return [`THE VAULT · ${data.moduleName}`, rankLine, statsLine, `Can you crack it? ${data.url}`].join("\n");
}

function spacedWidth(ctx: CanvasRenderingContext2D, text: string, spacing: number): number {
  return [...text].reduce((sum, ch) => sum + ctx.measureText(ch).width, 0) + spacing * Math.max(0, text.length - 1);
}

/** Draws letter-spaced text (canvas letterSpacing isn't universally supported). */
function drawSpaced(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number, align: "left" | "right" = "left"): number {
  const width = spacedWidth(ctx, text, spacing);
  let cursor = align === "right" ? x - width : x;
  ctx.textAlign = "left";
  [...text].forEach((ch) => {
    ctx.fillText(ch, cursor, y);
    cursor += ctx.measureText(ch).width + spacing;
  });
  return width;
}

/** Largest font size (<= max) at which `text` fits in `maxWidth`. */
function fitSize(ctx: CanvasRenderingContext2D, text: string, weight: number, family: string, max: number, maxWidth: number): number {
  let size = max;
  ctx.font = `${weight} ${size}px ${family}`;
  while (size > 12 && ctx.measureText(text).width > maxWidth) {
    size -= 2;
    ctx.font = `${weight} ${size}px ${family}`;
  }
  return size;
}

function drawBackground(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = C.ink;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 1000);
  glow.addColorStop(0, "rgba(207,171,92,0.22)");
  glow.addColorStop(1, "rgba(207,171,92,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const low = ctx.createRadialGradient(W, H, 0, W, H, 800);
  low.addColorStop(0, "rgba(207,171,92,0.08)");
  low.addColorStop(1, "rgba(207,171,92,0)");
  ctx.fillStyle = low;
  ctx.fillRect(0, 0, W, H);

  // Vault dial motif, top-right.
  const cx = W - 110;
  const cy = 250;
  ctx.save();
  [380, 320, 250, 170].forEach((r, i) => {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(207,171,92,${0.07 + i * 0.03})`;
    ctx.lineWidth = i === 1 ? 3 : 1.5;
    ctx.stroke();
  });
  for (let i = 0; i < 72; i += 1) {
    const a = (i / 72) * Math.PI * 2;
    const long = i % 6 === 0;
    const r1 = 322;
    const r2 = long ? 362 : 342;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
    ctx.strokeStyle = long ? "rgba(207,171,92,0.32)" : "rgba(207,171,92,0.14)";
    ctx.lineWidth = long ? 3 : 1.5;
    ctx.stroke();
  }
  ctx.restore();

  // Inset frame.
  ctx.strokeStyle = "rgba(207,171,92,0.28)";
  ctx.lineWidth = 2;
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(36, 36, W - 72, H - 72, 28);
    ctx.stroke();
  } else {
    ctx.strokeRect(36, 36, W - 72, H - 72);
  }
}

function drawStat(ctx: CanvasRenderingContext2D, label: string, value: string, x: number, y: number, width: number) {
  ctx.fillStyle = C.muted;
  ctx.font = `500 21px ${FONT_MONO}`;
  ctx.textBaseline = "alphabetic";
  drawSpaced(ctx, label.toUpperCase(), x, y, 3);

  const size = fitSize(ctx, value, 600, FONT_DISPLAY, 46, width - 24);
  ctx.font = `600 ${size}px ${FONT_DISPLAY}`;
  ctx.fillStyle = C.ivory;
  ctx.textAlign = "left";
  ctx.fillText(value, x, y + 64);
}

async function ensureFonts() {
  if (typeof document === "undefined" || !document.fonts) return;
  try {
    await Promise.all([
      document.fonts.load(`700 200px "Unbounded"`),
      document.fonts.load(`600 46px "Unbounded"`),
      document.fonts.load(`700 52px "Manrope"`),
      document.fonts.load(`500 40px "Manrope"`),
      document.fonts.load(`500 24px "DM Mono"`),
    ]);
  } catch {
    // Fall back to system fonts; the card still renders.
  }
}

/** Renders a 1080×1350 (4:5) PNG rank card in the vault's gold-on-ink style. */
export async function renderShareCard(data: ShareCardData): Promise<Blob> {
  await ensureFonts();
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");

  drawBackground(ctx);
  ctx.textBaseline = "alphabetic";

  // Brand.
  ctx.fillStyle = C.ivory;
  ctx.font = `700 40px ${FONT_DISPLAY}`;
  drawSpaced(ctx, "THE VAULT", PAD, 156, 8);
  ctx.fillStyle = C.gold;
  ctx.font = `500 24px ${FONT_MONO}`;
  drawSpaced(ctx, data.moduleName.toUpperCase(), PAD, 200, 5);

  // Scope + player.
  ctx.fillStyle = C.gold;
  ctx.font = `500 25px ${FONT_MONO}`;
  const scopeText = `${data.scopeLabel.toUpperCase()} · GLOBAL RANK`;
  const scopeSize = spacedWidth(ctx, scopeText, 5) > W - PAD * 2 ? 20 : 25;
  ctx.font = `500 ${scopeSize}px ${FONT_MONO}`;
  drawSpaced(ctx, scopeText, PAD, 372, 5);

  const nameSize = fitSize(ctx, data.playerName, 700, FONT_BODY, 54, W - PAD * 2);
  ctx.font = `700 ${nameSize}px ${FONT_BODY}`;
  ctx.fillStyle = C.ivory;
  ctx.textAlign = "left";
  ctx.fillText(data.playerName, PAD, 446);

  // Rank.
  const pct = percentileFor(data.rank, data.totalPlayers);
  const rankText = data.rank !== null ? `#${data.rank}` : "Unranked";
  const rankSize = fitSize(ctx, rankText, 700, FONT_DISPLAY, data.rank !== null ? 250 : 130, W - PAD * 2);
  ctx.font = `700 ${rankSize}px ${FONT_DISPLAY}`;
  const top = 690 - rankSize * 0.74;
  const grad = ctx.createLinearGradient(0, top, 0, 690);
  grad.addColorStop(0, C.goldHi);
  grad.addColorStop(0.55, C.gold);
  grad.addColorStop(1, C.goldDeep);
  ctx.save();
  ctx.shadowColor = "rgba(207,171,92,0.35)";
  ctx.shadowBlur = 40;
  ctx.fillStyle = grad;
  ctx.fillText(rankText, PAD - 6, 690);
  ctx.restore();

  ctx.font = `500 40px ${FONT_BODY}`;
  if (data.rank !== null) {
    const ofText = `of ${data.totalPlayers.toLocaleString("en-US")} players`;
    ctx.fillStyle = "rgba(241,238,227,0.62)";
    ctx.fillText(ofText, PAD, 768);
    if (pct !== null) {
      const ofWidth = ctx.measureText(ofText).width;
      ctx.font = `700 40px ${FONT_BODY}`;
      ctx.fillStyle = C.gold;
      ctx.fillText(`  ·  Top ${pct}%`, PAD + ofWidth, 768);
    }
  } else {
    ctx.fillStyle = "rgba(241,238,227,0.62)";
    ctx.fillText("Chasing the top 10", PAD, 768);
  }

  // Divider.
  const line = ctx.createLinearGradient(PAD, 0, W - PAD, 0);
  line.addColorStop(0, "rgba(207,171,92,0.7)");
  line.addColorStop(1, "rgba(207,171,92,0)");
  ctx.fillStyle = line;
  ctx.fillRect(PAD, 836, W - PAD * 2, 2);

  // Stats grid (3 × 2).
  const { stats } = data;
  const cells: [string, string][] = [
    ["Total VC", formatMoney(stats.totalVc)],
    ["Vaults cracked", `${stats.cracked}`],
    ["Accuracy", formatAccuracy(stats.accuracy)],
    ["Peak streak", `${stats.peakStreak}`],
    ["Digits earned", `${stats.digitsEarned}`],
    data.isEpisodeScope
      ? ["Perfect run", stats.perfectRuns ? "Yes" : "Not yet"]
      : ["Best run", stats.bestRun ? formatMoney(stats.bestRun.vc) : "—"],
  ];
  const cellW = (W - PAD * 2) / 3;
  cells.forEach(([label, value], i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    drawStat(ctx, label, value, PAD + col * cellW, 912 + row * 150, cellW);
  });
  if (!data.isEpisodeScope && data.bestRunEpisodeId) {
    ctx.fillStyle = C.muted;
    ctx.font = `500 20px ${FONT_MONO}`;
    ctx.fillText(data.bestRunEpisodeId, PAD + 2 * cellW, 912 + 150 + 100);
  }

  // Footer.
  ctx.fillStyle = C.gold;
  ctx.font = `500 24px ${FONT_MONO}`;
  drawSpaced(ctx, "CAN YOU CRACK IT?", PAD, H - 96, 4);
  ctx.fillStyle = C.muted;
  let host = data.url;
  try {
    host = new URL(data.url).host;
  } catch {
    // keep raw url
  }
  drawSpaced(ctx, host, W - PAD, H - 96, 1, "right");

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not create image"))), "image/png");
  });
}
