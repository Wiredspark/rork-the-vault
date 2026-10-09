// Builds functions/arena/pool.json from the released (non-draft) episode files in
// web/src/data/episodes. Re-run after adding or releasing episodes:
//   node functions/scripts/build-arena-pool.mjs
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const episodesDir = join(here, "../../web/src/data/episodes");
const outFile = join(here, "../arena/pool.json");

const clip = (text, max) => {
  const t = (text ?? "").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
};

const questions = [];
const vaults = [];

for (const file of readdirSync(episodesDir).filter((f) => f.endsWith(".json")).sort()) {
  const ep = JSON.parse(readFileSync(join(episodesDir, file), "utf8"));
  if (ep.status === "draft") continue;
  const code = Array.from({ length: ep.vault.codeLength }, () => "0");
  const free = [];
  for (const [i, d] of Object.entries(ep.vault.freeDigitMap)) {
    code[Number(i)] = d;
    free.push(Number(i));
  }
  const digitQuestions = [];
  for (const round of ep.rounds) {
    for (const q of [...round.questions, ...(round.reserve ?? [])]) {
      if (!Array.isArray(q.choices) || q.choices.length !== 4) continue;
      const fact = [q.metadata?.fact, q.metadata?.storyHook].find((t) => t?.trim()) ?? "";
      const item = {
        id: q.id,
        ep: ep.episodeId,
        d: q.type === "bonus" ? "bonus" : q.difficulty,
        q: q.question,
        c: q.choices,
        a: q.correctIndex,
        f: clip(fact, 260),
        y: q.metadata?.year ?? null,
      };
      if (q.type === "bonus" && q.bonus && round.questions.includes(q)) {
        code[q.bonus.codeDigitIndex] = q.bonus.codeDigit;
        digitQuestions.push({ ...item, di: q.bonus.codeDigitIndex, dv: q.bonus.codeDigit });
      } else if (q.type !== "bonus") {
        questions.push(item);
      }
    }
  }
  const note = ep.vault.note ?? "";
  const dash = note.indexOf("—");
  const story = clip(dash >= 0 ? note.slice(dash + 1) : note, 320);
  if (digitQuestions.length >= 2) {
    vaults.push({ ep: ep.episodeId, title: ep.title, code: code.join(""), free, story, digits: digitQuestions });
  }
}

writeFileSync(outFile, JSON.stringify({ generatedAt: new Date().toISOString(), questions, vaults }));
console.log(`arena pool: ${questions.length} questions, ${vaults.length} vaults`);
