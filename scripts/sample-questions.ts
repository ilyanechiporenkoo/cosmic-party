import { ContentStore, matchAnswer } from "../server/content.ts";
const store = new ContentStore();
const easy = store.questions.filter((q) => q.difficulty === 1);
for (let i = 0; i < 14; i++) {
  const q = store.pickQuestion([], new Set(), 15, 1);
  const idx = store.index(q.id);
  console.log(`[${q.kind}] ${q.text.ru} — ${q.answerCount}: ${idx.answers.slice(0, 6).map((a) => a.label.ru).join(", ")}`);
}
const k = store.index("animal-mammal~К");
console.log("кошка on К:", matchAnswer(k, "кошка").status, "| слон on К:", matchAnswer(k, "слон").status, "| easy total:", easy.length);

