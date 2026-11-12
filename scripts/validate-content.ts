/**
 * Validates data/content.db and prints measured counts. Exit code 1 on any violation.
 * Checks: unique question ids and texts, every answer belongs to an existing question,
 * canonical ids unique per question, both localized labels present, script sanity
 * (no Russian-only letters in Ukrainian labels and vice versa), declared counts match rows.
 */
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const db = new DatabaseSync(fileURLToPath(new URL("../data/content.db", import.meta.url)), { readOnly: true });
const errors: string[] = [];
const q = db.prepare("SELECT * FROM questions").all() as any[];

const dupe = (sql: string, what: string) => { for (const r of db.prepare(sql).all() as any[]) errors.push(`${what}: ${JSON.stringify(r)}`); };
dupe("SELECT id, COUNT(*) n FROM questions GROUP BY id HAVING n > 1", "duplicate question id");
dupe("SELECT text_uk, COUNT(*) n FROM questions GROUP BY text_uk HAVING n > 1", "duplicate uk question text");
dupe("SELECT text_ru, COUNT(*) n FROM questions GROUP BY text_ru HAVING n > 1", "duplicate ru question text");
dupe("SELECT question_id, COUNT(*) n FROM answers WHERE question_id NOT IN (SELECT id FROM questions) GROUP BY question_id", "orphan answers");
dupe("SELECT question_id, answer_id, COUNT(*) n FROM answers GROUP BY question_id, answer_id HAVING n > 1", "duplicate canonical id");
dupe("SELECT question_id, answer_id FROM answers WHERE label_uk IS NULL OR label_uk = '' OR label_ru IS NULL OR label_ru = ''", "missing label");
dupe("SELECT question_id, answer_id FROM answers WHERE answer_id NOT GLOB 'Q[0-9]*'", "non-Wikidata canonical id");
dupe("SELECT question_id, answer_id, label_uk FROM answers WHERE label_uk GLOB '*[ыэъёЫЭЪЁ]*'", "ru-only letters in uk label");
dupe("SELECT question_id, answer_id, label_ru FROM answers WHERE label_ru GLOB '*[іїєґІЇЄҐ]*'", "uk-only letters in ru label");
for (const row of q) {
  const n = (db.prepare("SELECT COUNT(*) n FROM answers WHERE question_id = ?").get(row.id) as any).n;
  if (n !== row.answer_count) errors.push(`count mismatch ${row.id}: declared ${row.answer_count}, rows ${n}`);
  if (!row.text_uk || !row.text_ru) errors.push(`missing question text ${row.id}`);
}
const total = (db.prepare("SELECT COUNT(*) n FROM answers").get() as any).n;
const aliases = (db.prepare("SELECT SUM(json_array_length(aliases)) n FROM answers").get() as any).n;
const ge1000 = q.filter((r) => r.answer_count >= 1000).length;
const ge500 = q.filter((r) => r.answer_count >= 500).length;
console.log(JSON.stringify({ questions: q.length, relations: total, aliases, questionsWith1000Plus: ge1000, questionsWith500Plus: ge500,
  median: q.map((r) => r.answer_count).sort((a, b) => a - b)[Math.floor(q.length / 2)], errors: errors.length }, null, 2));
if (errors.length) { console.log(errors.slice(0, 40).join("\n")); process.exit(1); }
