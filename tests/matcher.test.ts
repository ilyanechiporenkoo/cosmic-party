import { describe, it, expect } from "vitest";
import { buildIndex, matchAnswer, ContentStore, type Answer } from "../server/content.ts";
import { normalize, foldCyr } from "../server/text.ts";

const mk = (id: string, uk: string, ru: string, rank: number, aliases: string[] = []) => ({ answer: { id, label: { uk, ru }, rank, sitelinks: 100 - rank } as Answer, aliases });
const prog = buildIndex(
  { id: "t-prog", category: "programming", difficulty: 1, text: { uk: "", ru: "" }, answerCount: 6, filler: ["мова", "язык", "programming", "language", "scripts", "script", "программирования"], kind: "broad", template: null },
  [mk("Q28865", "Python", "Python", 1), mk("Q2005", "JavaScript", "JavaScript", 2, ["JS"]), mk("Q251", "Java", "Java", 3), mk("Q207316", "Lua", "Lua", 4, ["Луа"]), mk("Q2407", "C++", "C++", 5), mk("Q1", "Ruby", "Ruby", 6)],
);
const misc = buildIndex(
  { id: "t-misc", category: "general", difficulty: 1, text: { uk: "", ru: "" }, answerCount: 4, filler: ["місто", "город"], kind: "broad", template: null },
  [mk("Q49299", "Minecraft", "Minecraft", 1), mk("Q131538", "Капібара", "Капибара", 2), mk("Q60", "Нью-Йорк", "Нью-Йорк", 3), mk("Q90", "Париж", "Париж", 4)],
);
const id = (idx: any, s: string) => { const m = matchAnswer(idx, s); return m.status === "match" ? idx.answers[m.ids[0]].id : m.status; };

describe("normalization", () => {
  it("folds case, punctuation, ё and Ukrainian letters", () => {
    expect(normalize("  Нью-Йорк!! ")).toBe("нью йорк");
    expect(normalize("Ёжик")).toBe("ежик");
    expect(foldCyr(normalize("Капібара"))).toBe(foldCyr(normalize("Капибара")));
    expect(normalize("Йорк")).toBe("йорк");
  });
});

describe("matcher — prompt examples", () => {
  it("lua scripts → Lua", () => expect(id(prog, "lua scripts")).toBe("Q207316"));
  it("python programming → Python", () => expect(id(prog, "python programming")).toBe("Q28865"));
  it("javascript language → JavaScript", () => expect(id(prog, "javascript language")).toBe("Q2005"));
  it("JavaScript never becomes Java", () => { expect(id(prog, "JavaScript")).toBe("Q2005"); expect(id(prog, "javascrip")).toBe("Q2005"); });
  it("minecrfat → Minecraft (typo)", () => expect(id(misc, "minecrfat")).toBe("Q49299"));
  it("майнкрафт → Minecraft (transliteration)", () => expect(id(misc, "майнкрафт")).toBe("Q49299"));
  it("капібара ≡ капибара", () => { expect(id(misc, "капібара")).toBe("Q131538"); expect(id(misc, "капибара")).toBe("Q131538"); });
  it("нью йорк → Нью-Йорк", () => expect(id(misc, "нью йорк")).toBe("Q60"));
  it("inflection: капибары → Капибара", () => expect(id(misc, "капибары")).toBe("Q131538"));
  it("context filler: місто Париж", () => expect(id(misc, "місто париж")).toBe("Q90"));
  it("aliases and abbreviations: JS, Луа, c++", () => { expect(id(prog, "js")).toBe("Q2005"); expect(id(prog, "луа")).toBe("Q207316"); expect(id(prog, "c++")).toBe("Q2407"); });
  it("two answers in one input → ambiguous, not silently chosen", () => expect(matchAnswer(prog, "python lua").status).toBe("ambiguous"));
  it("unrelated words do not match", () => {
    for (const s of ["coffee", "java island", "luna", "pyt", "банан", "ru", "a"]) expect(matchAnswer(prog, s).status).not.toBe("match");
  });
  it("empty input", () => expect(matchAnswer(prog, "   ").status).toBe("empty"));
});

let store: ContentStore | null = null;
try { store = new ContentStore(); } catch { store = null; }
describe.skipIf(!store)("matcher — real Wikidata content", () => {
  it("programming languages: lua scripts, python, пайтон, джаваскрипт", () => {
    const idx = store!.index("prog-language");
    const lab = (s: string) => { const m = matchAnswer(idx, s); return m.status === "match" ? idx.answers[m.ids[0]].label.ru : m.status; };
    expect(lab("lua scripts")).toBe("Lua");
    expect(lab("python programming")).toBe("Python");
    expect(lab("javascript language")).toBe("JavaScript");
    expect(lab("JavaScript")).toBe("JavaScript");
    expect(lab("пайтон")).toBe("Python");
    expect(lab("язык программирования Java")).toBe("Java");
  });
  it("chemical elements in both languages share an id", () => {
    const idx = store!.index("sci-element");
    const a = matchAnswer(idx, "Залізо"), b = matchAnswer(idx, "Железо");
    expect(a.status).toBe("match"); expect(b.status).toBe("match");
    expect(idx.answers[a.ids[0]].id).toBe(idx.answers[b.ids[0]].id);
  });
});
