import type { Entry, Example } from "../atlas/types";
import { gap } from "./text";

export type ScenePart = NonNullable<Example["parts"]>[number];

/** Prefer explicitly authored spans, including inflections and multiple blanks. */
export function sceneFor(entry: Entry) {
  for (const [index, example] of entry.ex.entries()) {
    if (example.parts?.some((p) => p.blank) && example.parts.map((p) => p.text).join("") === example.en) {
      return { example, index, parts: example.parts, fallback: false };
    }
    // Japanese requires explicit spans: English stemming must not guess Japanese inflections.
    if (example.lang === "ja" || /[\u3040-\u30ff\u3400-\u9fff]/u.test(example.en)) continue;
    const match = gap(example.en, entry.w);
    if (match) {
      const parts: ScenePart[] = [{ text: match.before }, { text: match.hidden, blank: true }, { text: match.after }];
      return { example, index, parts, fallback: false };
    }
  }
  // Never expose the headword just because a usable cloze is missing.
  return { example: { en: entry.w, zh: entry.senses[0]?.zh ?? "", lang: /[\u3040-\u9fff]/u.test(entry.w) ? "ja" as const : "en" as const },
    index: -1, parts: [{ text: entry.w, blank: true }] as ScenePart[], fallback: true };
}
