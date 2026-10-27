import assert from "node:assert/strict";
import { test } from "node:test";
import type { Entry } from "../atlas/types";
import { sceneFor } from "./scene";
const entry = (w: string, ex: Entry["ex"]): Entry => ({ id: w, w, ex, uk: "", us: "", senses: [{ pos: "", zh: "释义", en: "" }], col: [], fam: [], syn: [], ant: [], tip: "", cefr: "", topic: "", m: 0 });

test("clozes inflected forms and phrases instead of exposing the headword", () => {
  const scene = sceneFor(entry("take off", [{ en: "Please take off your shoes.", zh: "请脱鞋。" }]));
  assert.equal(scene.parts.filter((p) => p.blank).map((p) => p.text).join(""), "take off");
  assert.equal(scene.parts.filter((p) => !p.blank).map((p) => p.text).join(""), "Please  your shoes.");
  assert.equal(sceneFor(entry("go", [{ en: "She went home.", zh: "她回家了。" }])).parts.find((p) => p.blank)?.text, "went");
});

test("Japanese spans keep kanji readings and multiple blanks without guessing inflections", () => {
  const parts = [{ text: "荷物", reading: "にもつ" }, { text: "を" }, { text: "預", reading: "あず", blank: true }, { text: "かって", blank: true }, { text: "もらえますか。" }];
  const scene = sceneFor(entry("預かる", [{ en: "荷物を預かってもらえますか。", zh: "能帮我寄存行李吗？", lang: "ja", parts }]));
  assert.deepEqual(scene.parts, parts);
  assert.equal(scene.fallback, false);
  assert.equal(scene.parts.filter((p) => p.blank).map((p) => p.text).join(""), "預かって");
});

test("missing or invalid cloze metadata uses a hidden-target fallback", () => {
  const scene = sceneFor(entry("預かる", [{ en: "荷物を預かってもらえますか。", zh: "寄存行李", lang: "ja" }]));
  assert.equal(scene.fallback, true);
  assert.deepEqual(scene.parts, [{ text: "預かる", blank: true }]);
  const invalid = sceneFor(entry("take", [{ en: "Hello.", zh: "你好", parts: [{ text: "leaked", blank: true }] }]));
  assert.equal(invalid.fallback, true);
});
