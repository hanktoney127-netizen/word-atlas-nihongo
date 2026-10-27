import assert from "node:assert/strict";
import { test } from "node:test";
import type { Atlas } from "../atlas/types";
import { buildSession, rateScene, sceneSession } from "./session";
import { Rating, review } from "./srs";
import { defaultSettings, emptyProgress, sanitizeSettings, sanitizeProgress } from "./store";
const words = ["a", "b", "c"].map((id, order) => ({ id, word: id, zh: id, ipa: "", cefr: 0, topic: 0, media: 1, order }));
const atlas = { words, byId: new Map(words.map((w) => [w.id, w])) } as unknown as Atlas;
const settings = { ...defaultSettings, dailyNew: 2 };

test("new scene sessions have one hidden recall step per target, reviews first", () => {
  const p = emptyProgress("test");
  p.cards.c = review(undefined, Rating.Again, Date.now() - 1000000);
  const s = buildSession(atlas, p, settings);
  assert.equal(s.mode, "scene");
  assert.deepEqual(s.steps.map((s) => s.id), ["c", "a", "b"]);
  assert.ok(s.steps.every((s) => s.kind === "picture"));
  assert.deepEqual(s.graded, {});
});

test("rating updates FSRS and advances atomically; a repeated click cannot grade the next card", () => {
  let p = emptyProgress("test");
  p.session = buildSession(atlas, p, settings);
  const id = p.session.id;
  p = rateScene(p, id, 0, Rating.Good, 12, settings.retention);
  assert.equal(p.cards.a.reps, 1);
  assert.equal(p.session?.index, 1);
  const again = rateScene(p, id, 0, Rating.Good, 12, settings.retention);
  assert.strictEqual(again, p);
  assert.equal(again.cards.b, undefined);
  p = rateScene(p, id, 1, Rating.Again, 8, settings.retention);
  assert.ok(p.session?.finished);
  assert.deepEqual(p.mistakes, ["b"]);
  assert.equal(Object.values(p.days)[0].r, 2);
  assert.equal(Object.values(p.days)[0].n, 2);
  assert.ok(p.cards.b.due > Date.now());
});

test("migrates unfinished legacy intros without counting already graded targets twice", () => {
  const p = emptyProgress("test");
  p.session = { id: "old", started: 1, steps: [{ id: "a", kind: "intro" }, { id: "b", kind: "intro" }, { id: "a", kind: "picture" }, { id: "b", kind: "meaning" }], index: 1, graded: { a: Rating.Good }, newIds: ["a", "b"], reviewIds: [], pending: { correct: true, value: "a" } };
  const migrated = sceneSession(atlas, p, settings);
  assert.deepEqual(migrated.steps.map((s) => s.id), ["b"]);
  assert.equal(migrated.pending, undefined);
  assert.deepEqual(migrated.graded, { a: Rating.Good });
});

test("saved scene progress and visibility settings survive a round trip", () => {
  let p = emptyProgress("test");
  p.session = buildSession(atlas, p, settings);
  p = rateScene(p, p.session.id, 0, Rating.Hard, 5, settings.retention);
  const restored = sanitizeProgress(JSON.parse(JSON.stringify(p)), "test");
  assert.equal(restored.session?.mode, "scene");
  assert.equal(restored.session?.index, 1);
  assert.equal(restored.cards.a.reps, 1);
  assert.equal(sceneSession(atlas, restored, settings), restored.session);
  const s = sanitizeSettings({ hideMotherTongue: true, showFurigana: false });
  assert.equal(s.hideMotherTongue, true);
  assert.equal(s.showFurigana, false);
});
