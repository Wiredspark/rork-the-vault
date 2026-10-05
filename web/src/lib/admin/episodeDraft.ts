import { extractStory, validateEpisode, type RawEpisode, type RawQuestion, type RawRound } from "@/lib/episode";

/** Publication state shown in the admin hub, derived from status + publish_at. */
export type LiveState = "draft" | "scheduled" | "live";
/** Which array of a round a question lives in. Standard + bonus share `questions`; Swap reserves live in `reserve`. */
export type QuestionList = "questions" | "reserve";
export type QuestionKind = "standard" | "bonus" | "reserve";
export type ImportMode = "merge" | "append";

export interface EditorIssue {
  level: "error" | "warning";
  where: string;
  message: string;
  roundIndex?: number;
}

export const EPISODE_ID_RE = /^EP\d{3,}$/;

interface RoundTemplate {
  name: string;
  description: string;
  payouts: number[];
  timer: number;
  bonusTimer: number;
  difficulty: string;
}

const ROUND_TEMPLATES: RoundTemplate[] = [
  {
    name: "RADIO HITS",
    description: "The songs everyone knows. Chart toppers, radio staples, mainstream R&B. Warm up fast.",
    payouts: [150, 250, 350, 450, 550, 750],
    timer: 15,
    bonusTimer: 20,
    difficulty: "easy",
  },
  {
    name: "DEEP CUTS",
    description: "Obscure cuts. Rare collabs. Overlooked artists. Only true R&B heads make it out of here.",
    payouts: [1000, 1200, 1400, 1800, 2100],
    timer: 17,
    bonusTimer: 20,
    difficulty: "medium",
  },
  {
    name: "HIDDEN GEMS",
    description: "Collector-level recall. B-sides, liner notes and the stories behind the songs.",
    payouts: [4500, 5500],
    timer: 20,
    bonusTimer: 23,
    difficulty: "hard",
  },
];

export const LETTERS = ["A", "B", "C", "D"] as const;

/** Stable editor-only key so cards keep focus across immutable updates. Stripped before save/export. */
export function newKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `k${Math.random().toString(36).slice(2)}`;
}

export function keyOf(q: RawQuestion): string {
  return typeof q._key === "string" ? q._key : q.id;
}

function stripKey(q: RawQuestion): RawQuestion {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _key, ...rest } = q;
  return rest as RawQuestion;
}

/** Adds editor keys to every question of a loaded episode. */
export function withEditorKeys(raw: RawEpisode): RawEpisode {
  return {
    ...raw,
    rounds: raw.rounds.map((r) => ({
      ...r,
      questions: (r.questions ?? []).map((q) => ({ ...q, _key: newKey() })),
      reserve: (r.reserve ?? []).map((q) => ({ ...q, _key: newKey() })),
    })),
  };
}

export function liveState(status: string, publishAt: string | null, now: number = Date.now()): LiveState {
  if (status === "draft" || !publishAt) return "draft";
  return Date.parse(publishAt) <= now ? "live" : "scheduled";
}

export function formatEpisodeId(n: number): string {
  return `EP${String(n).padStart(3, "0")}`;
}

/** Next free id after the highest existing episode number. */
export function nextEpisodeId(ids: string[]): string {
  const max = ids.reduce((m, id) => Math.max(m, parseInt(id.replace(/\D/g, ""), 10) || 0), 0);
  return formatEpisodeId(max + 1);
}

export function cloneEpisode(raw: RawEpisode): RawEpisode {
  return JSON.parse(JSON.stringify(raw)) as RawEpisode;
}

function roundTemplate(roundIndex: number): RoundTemplate {
  return ROUND_TEMPLATES[roundIndex] ?? ROUND_TEMPLATES[ROUND_TEMPLATES.length - 1];
}

export function blankQuestion(kind: QuestionKind, roundIndex: number, payout: number | null = null): RawQuestion {
  const tpl = roundTemplate(roundIndex);
  return {
    _key: newKey(),
    id: "",
    round: roundIndex + 1,
    slot: null,
    type: kind,
    difficulty: kind === "bonus" ? "bonus" : tpl.difficulty,
    category: tpl.name,
    question: "",
    choices: ["", "", "", ""],
    correctIndex: 0,
    payout: kind === "standard" ? (payout ?? tpl.payouts[tpl.payouts.length - 1]) : kind === "bonus" ? 0 : null,
    timer: kind === "bonus" ? tpl.bonusTimer : tpl.timer,
    bonus: kind === "bonus" ? { codeDigitIndex: roundIndex, bonusHint: "", codeDigit: "0" } : null,
    metadata: { fact: "" },
  };
}

/** A fresh 3-round episode using the house format (6+B / 5+B / 2+B, 4-digit vault, digit 4 free). */
export function createEpisodeTemplate(id: string): RawEpisode {
  return {
    episodeId: id,
    title: "",
    theme: "",
    version: "1.0",
    status: "production",
    vault: { codeLength: 4, freeDigitMap: { "3": "0" }, note: "" },
    scoring: { vaultPrize: 5000 },
    rounds: ROUND_TEMPLATES.map((tpl, i) => ({
      round: i + 1,
      name: tpl.name,
      tag: `ROUND 0${i + 1} OF 03`,
      description: tpl.description,
      defaultTimer: tpl.timer,
      bonusTimer: tpl.bonusTimer,
      questions: [...tpl.payouts.map((p) => blankQuestion("standard", i, p)), blankQuestion("bonus", i)],
      reserve: [blankQuestion("reserve", i)],
    })),
  };
}

/** Digits of the vault code, assembled from free digits and each round's bonus digit. */
export function getVaultCode(raw: RawEpisode): string[] {
  const len = raw.vault?.codeLength ?? 4;
  const code = Array.from({ length: len }, () => "");
  Object.entries(raw.vault?.freeDigitMap ?? {}).forEach(([k, d]) => {
    code[Number(k)] = d;
  });
  (raw.rounds ?? []).forEach((round) =>
    (round.questions ?? []).forEach((q) => {
      if (q.type === "bonus" && q.bonus && q.bonus.codeDigitIndex < len) code[q.bonus.codeDigitIndex] = q.bonus.codeDigit;
    }),
  );
  return code;
}

/** Writes the code back into the free-digit map and the bonus questions that unlock each digit. */
export function setVaultCode(raw: RawEpisode, code: string[]): RawEpisode {
  const freeDigitMap: Record<string, string> = {};
  Object.keys(raw.vault?.freeDigitMap ?? {}).forEach((k) => {
    freeDigitMap[k] = code[Number(k)] ?? "0";
  });
  return {
    ...raw,
    vault: { ...raw.vault, freeDigitMap },
    rounds: raw.rounds.map((round) => ({
      ...round,
      questions: round.questions.map((q) =>
        q.type === "bonus" && q.bonus ? { ...q, bonus: { ...q.bonus, codeDigit: code[q.bonus.codeDigitIndex] ?? "0" } } : q,
      ),
    })),
  };
}

export function getVaultStory(raw: RawEpisode): string {
  return extractStory(raw.vault?.note ?? "");
}

export function setVaultStory(raw: RawEpisode, story: string): RawEpisode {
  const code = getVaultCode(raw);
  const free = Object.keys(raw.vault?.freeDigitMap ?? {})
    .map(Number)
    .sort((a, b) => a - b);
  const rule = free.length ? `Digit ${free[0] + 1} (index ${free[0]}) is always visible. ` : "";
  return { ...raw, vault: { ...raw.vault, note: `${rule}Vault code ${code.join("-")} — ${story}` } };
}

export function questionFact(q: RawQuestion): string {
  return q.metadata?.fact ?? "";
}

export function withFact(q: RawQuestion, fact: string): RawQuestion {
  return { ...q, metadata: { ...(q.metadata ?? {}), fact } };
}

function trimQuestion(q: RawQuestion, keepKeys: boolean): RawQuestion {
  return {
    ...(keepKeys ? q : stripKey(q)),
    question: (q.question ?? "").trim(),
    choices: [0, 1, 2, 3].map((i) => (q.choices?.[i] ?? "").trim()),
    metadata: { ...(q.metadata ?? {}), fact: (q.metadata?.fact ?? "").trim() },
  };
}

/**
 * Canonical form saved to the database: bonus last, slots renumbered, round numbers and tags set,
 * missing or duplicate ids generated. Existing ids are kept so in-progress runs stay valid.
 */
export function finalizeEpisode(input: RawEpisode, opts: { keepKeys?: boolean } = {}): RawEpisode {
  const keepKeys = opts.keepKeys === true;
  const raw = cloneEpisode(input);
  const epId = raw.episodeId;
  const taken = new Set<string>();
  const claim = (current: string, base: string): string => {
    if (current && !taken.has(current)) {
      taken.add(current);
      return current;
    }
    let candidate = base;
    let n = 2;
    while (taken.has(candidate)) candidate = `${base}-${n++}`;
    taken.add(candidate);
    return candidate;
  };

  raw.title = (raw.title ?? "").trim();
  raw.theme = (raw.theme ?? "").trim();
  raw.rounds = raw.rounds.map((round, ri) => {
    const n = ri + 1;
    const ordered = [...round.questions.filter((q) => q.type !== "bonus"), ...round.questions.filter((q) => q.type === "bonus")];
    let std = 0;
    const questions = ordered.map((q, qi) => {
      const isBonus = q.type === "bonus";
      if (!isBonus) std += 1;
      return {
        ...trimQuestion(q, keepKeys),
        episodeId: epId,
        round: n,
        slot: qi + 1,
        type: isBonus ? "bonus" : "standard",
        id: claim(q.id, isBonus ? `${epId}-R${n}-B${n}` : `${epId}-R${n}-Q${std}`),
        timer: q.timer ?? (isBonus ? round.bonusTimer : round.defaultTimer) ?? null,
      };
    });
    const reserve = (round.reserve ?? []).map((q, qi) => ({
      ...trimQuestion(q, keepKeys),
      episodeId: epId,
      round: n,
      slot: null,
      type: "reserve",
      payout: null,
      bonus: null,
      id: claim(q.id, `${epId}-R${n}-RES${qi + 1}`),
    }));
    return { ...round, round: n, tag: `ROUND 0${n} OF 0${raw.rounds.length}`, questions, reserve };
  });
  return raw;
}

/** Editor-facing problems: errors block publishing, warnings don't. */
export function collectIssues(raw: RawEpisode): EditorIssue[] {
  const issues: EditorIssue[] = [];
  const err = (where: string, message: string, roundIndex?: number) => issues.push({ level: "error", where, message, roundIndex });
  const warn = (where: string, message: string, roundIndex?: number) => issues.push({ level: "warning", where, message, roundIndex });

  if (!EPISODE_ID_RE.test(raw.episodeId ?? "")) err("Episode", "ID must look like EP021.");
  if (!raw.title?.trim()) err("Episode", "Add a title.");
  if (!raw.theme?.trim()) warn("Episode", "Add a theme line.");
  const code = getVaultCode(raw);
  if (code.some((d) => !/^\d$/.test(d))) err("Vault", "Every vault digit must be 0–9.");
  if (!getVaultStory(raw).trim()) warn("Vault", "Add the vault story players see when they crack it.");

  raw.rounds.forEach((round, ri) => {
    const label = `R${ri + 1}`;
    if (!round.name?.trim()) err(label, "Round needs a name.", ri);
    const standard = round.questions.filter((q) => q.type !== "bonus");
    const bonus = round.questions.filter((q) => q.type === "bonus");
    if (standard.length === 0) err(label, "Add at least one question.", ri);
    if (bonus.length !== 1) err(label, "Each round needs exactly one bonus question.", ri);
    if (!(round.reserve ?? []).length) warn(label, "No reserve questions — Swap won't work this round.", ri);

    const check = (q: RawQuestion, name: string) => {
      const where = `${label} · ${name}`;
      if (!q.question?.trim()) err(where, "Question text is empty.", ri);
      const choices = [0, 1, 2, 3].map((i) => (q.choices?.[i] ?? "").trim());
      if (choices.some((c) => !c)) err(where, "Fill in all four choices.", ri);
      else if (new Set(choices.map((c) => c.toLowerCase())).size < 4) err(where, "Choices must be different.", ri);
      if (!(q.correctIndex >= 0 && q.correctIndex <= 3)) err(where, "Pick the correct answer.", ri);
      if (q.type === "standard" && !(Number(q.payout) > 0)) err(where, "Payout must be above 0 VC.", ri);
      if (!questionFact(q).trim()) warn(where, "No fun fact.", ri);
    };
    let s = 0;
    round.questions.forEach((q) => {
      if (q.type === "bonus") check(q, "Bonus");
      else check(q, `Q${++s}`);
    });
    (round.reserve ?? []).forEach((q, i) => check(q, `Reserve ${i + 1}`));
  });

  validateEpisode(finalizeEpisode(raw))
    .filter((m) => !/invalid choices|MISSING_STANDARD_PAYOUT/.test(m))
    .forEach((m) => err("Structure", m));
  return issues;
}

// ── Per-round bulk import / export ──────────────────────────────────────────

const CSV_HEADER = ["type", "question", "choice_a", "choice_b", "choice_c", "choice_d", "correct", "payout", "fact", "bonus_hint"];

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

/** Header plus sample rows showing every question type. */
export function csvTemplate(): string {
  return [
    CSV_HEADER.join(","),
    `standard,"Which group sang 'Weak'?",Jade,SWV,En Vogue,Xscape,B,150,"SWV stood for Sisters With Voices.",`,
    `bonus,"TLC released 'CrazySexyCool' in what year?",1995,1992,1994,1993,C,,"Released November 1994.","Digit 1 — the year CrazySexyCool dropped"`,
    `reserve,"Which singer recorded 'Fortunate'?",Maxwell,Ginuwine,Tyrese,Maxwell,D,,"Written by R. Kelly for the Life soundtrack.",`,
  ].join("\n");
}

export function roundToCsv(round: RawRound): string {
  const all = [...round.questions, ...(round.reserve ?? []).map((q) => ({ ...q, type: "reserve" }))];
  const lines = all.map((q) =>
    [
      q.type,
      q.question ?? "",
      ...[0, 1, 2, 3].map((i) => q.choices?.[i] ?? ""),
      LETTERS[q.correctIndex] ?? "A",
      q.type === "standard" ? String(q.payout ?? "") : "",
      questionFact(q),
      q.bonus?.bonusHint ?? "",
    ]
      .map((v) => csvCell(String(v)))
      .join(","),
  );
  return [CSV_HEADER.join(","), ...lines].join("\n");
}

export function roundToJson(round: RawRound): string {
  return JSON.stringify(
    { round: round.round, name: round.name, questions: round.questions.map(stripKey), reserve: (round.reserve ?? []).map(stripKey) },
    null,
    2,
  );
}

function normalizeKind(value: unknown): QuestionKind {
  const v = String(value ?? "").toLowerCase().trim();
  if (v.startsWith("bonus")) return "bonus";
  if (v.startsWith("res")) return "reserve";
  return "standard";
}

function correctFrom(value: string, choices: string[]): number {
  const v = value.trim();
  const letter = LETTERS.indexOf(v.toUpperCase() as (typeof LETTERS)[number]);
  if (letter >= 0) return letter;
  if (/^[1-4]$/.test(v)) return Number(v) - 1;
  const byText = choices.findIndex((c) => c.trim().toLowerCase() === v.toLowerCase());
  return byText >= 0 ? byText : 0;
}

function sanitizeImported(input: Partial<RawQuestion>, roundIndex: number, kindOverride?: QuestionKind): RawQuestion {
  const kind = kindOverride ?? normalizeKind(input.type);
  const base = blankQuestion(kind, roundIndex);
  const choices = [0, 1, 2, 3].map((i) => String(input.choices?.[i] ?? ""));
  const payout = Number(input.payout);
  return {
    ...base,
    ...input,
    _key: newKey(),
    id: typeof input.id === "string" ? input.id : "",
    type: kind,
    question: String(input.question ?? ""),
    choices,
    correctIndex: typeof input.correctIndex === "number" && input.correctIndex >= 0 && input.correctIndex <= 3 ? input.correctIndex : 0,
    payout: kind === "standard" ? (payout > 0 ? payout : base.payout) : kind === "bonus" ? 0 : null,
    bonus: kind === "bonus" ? { ...(base.bonus as NonNullable<RawQuestion["bonus"]>), ...(input.bonus ?? {}), codeDigitIndex: roundIndex } : null,
    metadata: { ...(input.metadata ?? {}), fact: String(input.metadata?.fact ?? "") },
  };
}

/** Parses pasted/uploaded round content: the JSON export format, a JSON array of questions, or CSV. */
export function parseRoundImport(text: string, roundIndex: number): { questions: RawQuestion[]; error: string | null } {
  const trimmed = text.trim();
  if (!trimmed) return { questions: [], error: "Paste or upload some questions first." };
  try {
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      const parsed = JSON.parse(trimmed) as unknown;
      let list: Partial<RawQuestion>[] = [];
      if (Array.isArray(parsed)) list = parsed as Partial<RawQuestion>[];
      else if (parsed && typeof parsed === "object") {
        const obj = parsed as { questions?: Partial<RawQuestion>[]; reserve?: Partial<RawQuestion>[] };
        list = [...(obj.questions ?? []), ...(obj.reserve ?? []).map((q) => ({ ...q, type: "reserve" }))];
      }
      if (!list.length) return { questions: [], error: "No questions found in that JSON." };
      return { questions: list.map((q) => sanitizeImported(q, roundIndex)), error: null };
    }
    const rows = parseCsv(trimmed);
    if (rows.length < 2) return { questions: [], error: "CSV needs a header row plus at least one question." };
    const header = rows[0].map((h) => h.trim().toLowerCase());
    const col = (name: string) => header.indexOf(name);
    if (col("question") < 0) return { questions: [], error: `CSV header must include: ${CSV_HEADER.join(", ")}` };
    const questions = rows.slice(1).map((r) => {
      const get = (name: string) => (col(name) >= 0 ? (r[col(name)] ?? "") : "");
      const choices = ["choice_a", "choice_b", "choice_c", "choice_d"].map(get);
      const kind = normalizeKind(get("type") || "standard");
      return sanitizeImported(
        {
          type: kind,
          question: get("question"),
          choices,
          correctIndex: correctFrom(get("correct"), choices),
          payout: Number(get("payout")) || null,
          metadata: { fact: get("fact") },
          bonus: kind === "bonus" ? { codeDigitIndex: roundIndex, bonusHint: get("bonus_hint"), codeDigit: "0" } : null,
        },
        roundIndex,
        kind,
      );
    });
    return { questions, error: null };
  } catch {
    return { questions: [], error: "That doesn't parse. Check the JSON or CSV formatting." };
  }
}

/**
 * Merges imported questions into a round.
 * merge: each kind present in the import (standard / bonus / reserve) replaces that kind; others are kept.
 * append: standard + reserve are added to the end; an imported bonus replaces the bonus.
 */
export function applyRoundImport(round: RawRound, imported: RawQuestion[], mode: ImportMode): RawRound {
  const curStd = round.questions.filter((q) => q.type !== "bonus");
  const curBonus = round.questions.find((q) => q.type === "bonus");
  const curRes = round.reserve ?? [];
  const impStd = imported.filter((q) => q.type === "standard");
  const impBonus = imported.find((q) => q.type === "bonus");
  const impRes = imported.filter((q) => q.type === "reserve");

  // Keep the existing bonus digit unless the import overrides it.
  const bonus = impBonus
    ? { ...impBonus, bonus: { ...(impBonus.bonus as NonNullable<RawQuestion["bonus"]>), codeDigit: curBonus?.bonus?.codeDigit ?? "0", codeDigitIndex: curBonus?.bonus?.codeDigitIndex ?? impBonus.bonus?.codeDigitIndex ?? 0 } }
    : curBonus;
  const standard = mode === "append" ? [...curStd, ...impStd] : impStd.length ? impStd : curStd;
  const reserve = mode === "append" ? [...curRes, ...impRes] : impRes.length ? impRes : curRes;
  return { ...round, questions: bonus ? [...standard, bonus] : standard, reserve };
}

/** Triggers a browser download of text content. */
export function downloadText(filename: string, text: string, mime: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Reads and loosely checks an uploaded episode file. */
export function parseEpisodeFile(text: string): { episode: RawEpisode | null; error: string | null } {
  try {
    const parsed = JSON.parse(text) as Partial<RawEpisode>;
    if (!parsed || typeof parsed !== "object" || !parsed.episodeId || !Array.isArray(parsed.rounds)) {
      return { episode: null, error: "Not an episode file — it needs episodeId and rounds." };
    }
    const episode = parsed as RawEpisode;
    episode.vault = episode.vault ?? { codeLength: 4, freeDigitMap: { "3": "0" }, note: "" };
    episode.scoring = episode.scoring ?? { vaultPrize: 5000 };
    episode.rounds = episode.rounds.map((r) => ({ ...r, questions: r.questions ?? [], reserve: r.reserve ?? [] }));
    return { episode, error: null };
  } catch {
    return { episode: null, error: "That file isn't valid JSON." };
  }
}
