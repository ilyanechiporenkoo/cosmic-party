// Text normalization primitives for Ukrainian / Russian / Latin answer matching.

/** lowercase, unify letters, drop punctuation, collapse whitespace */
export function normalize(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[’'`ʼ‘]/g, "") // apostrophes (п'ять → пять)
    .replace(/(^|[^\p{L}])с(?=\+\+|#)/gu, "$1c") // Cyrillic с++ / с# typed on a Russian layout → Latin c
    .replace(/[+]{2}/g, "pp") // c++ → cpp
    .replace(/#/g, "sharp") // c# → csharp
    // strip Latin diacritics (é→e) but protect Cyrillic й / ї which decompose under NFD
    .replace(/й/g, "\u0001").replace(/ї/g, "\u0002")
    .normalize("NFD").replace(/[̀-ͯ]/g, "").normalize("NFC")
    .replace(/\u0001/g, "й").replace(/\u0002/g, "ї")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Normalize then fold Ukrainian-specific letters to Russian equivalents, so uk/ru spellings converge. */
export function foldCyr(s: string): string {
  return s
    .replace(/[іїы]/g, "и")
    .replace(/є/g, "е")
    .replace(/э/g, "е")
    .replace(/ґ/g, "г")
    .replace(/[ъь]/g, "");
}

const CYR2LAT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", ґ: "g", д: "d", е: "e", є: "e", ж: "zh", з: "z", и: "i", і: "i", ї: "i", й: "i",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts",
  ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "i", ь: "", э: "e", ю: "yu", я: "ya",
};
export function cyrToLat(s: string): string {
  let out = "";
  for (const ch of s) out += CYR2LAT[ch] ?? ch;
  return out;
}

/**
 * A lossy phonetic key over Latin text, used to bridge transliterations:
 * "майнкрафт" → majnkraft → mnkrft, "minecraft" → mnkrft.
 */
export function phoneticKey(lat: string): string {
  let s = lat
    .replace(/ph/g, "f").replace(/th/g, "t").replace(/ck/g, "k").replace(/q/g, "k")
    .replace(/x/g, "ks").replace(/w/g, "v").replace(/c(?=[eiy])/g, "s").replace(/c/g, "k")
    .replace(/zh/g, "j").replace(/sch/g, "sh").replace(/ts/g, "c").replace(/kh/g, "h").replace(/z/g, "s");
  const words = s.split(" ").map((w) => {
    if (!w) return w;
    const first = w[0];
    const rest = w.slice(1).replace(/[aeiouyjh]/g, "");
    return (first + rest).replace(/(.)\1+/g, "$1");
  });
  return words.join(" ");
}

const ENDINGS = [
  "ями", "ами", "ого", "ему", "ому", "ими", "ыми", "ой", "ей", "ий", "ый", "ая", "яя", "ое", "ее", "ом", "ем",
  "ах", "ях", "ов", "ев", "ам", "ям", "ою", "ею", "ів", "їв", "і", "ї", "а", "я", "ы", "и", "у", "ю", "е", "о", "ь",
];
/** Light stemmer for inflected Cyrillic words (case endings / plurals). Only applies to words ≥ 4 letters. */
export function stemWord(w: string): string {
  if (w.length < 4 || !/[а-яіїєґ]/.test(w)) return w;
  for (const e of ENDINGS) {
    if (w.endsWith(e) && w.length - e.length >= 3) return w.slice(0, -e.length);
  }
  return w;
}
export const stem = (s: string) => s.split(" ").map(stemWord).join(" ");

/** Optimal-string-alignment Damerau–Levenshtein distance with early exit above `max`. */
export function editDistance(a: string, b: string, max = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const n = a.length, m = b.length;
  let prev2: number[] = new Array(m + 1).fill(0);
  let prev: number[] = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i++) {
    const cur = new Array(m + 1);
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev; prev = cur;
  }
  return prev[m];
}

/** How many typos are tolerated for a key of this length. */
export function typoBudget(len: number): number {
  if (len <= 3) return 0;
  if (len <= 5) return 1;
  if (len <= 10) return 2;
  return 3;
}

/** Generic filler words that may wrap an answer in any category. */
export const GENERIC_FILLER = new Set([
  "the", "a", "an", "of",
  "це", "это", "мабуть", "наверное", "напевно", "може", "может", "ну", "ось", "вот", "і", "и", "та", "мій", "мой",
]);
