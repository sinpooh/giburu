import { test } from "node:test";
import assert from "node:assert/strict";
import { pickSlots, sortCards, rankMembers, currentSmokeKey } from "../logic";
import { DEFAULT_SETTINGS } from "../config";
import { jstParts, jstDate } from "../time";

// 2026-10-05(月) 09:00 JST
const now = jstDate(2026, 10, 5, 9, 0);

test("3枠は別々の平日、10〜18時、午前・午後・夕方に散る", () => {
  const slots = pickSlots(now, [], DEFAULT_SETTINGS);
  assert.equal(slots.length, 3);
  const days = new Set(slots.map((s) => jstParts(new Date(s.start)).d));
  assert.equal(days.size, 3);
  const hours = slots.map((s) => jstParts(new Date(s.start)).hh);
  assert.deepEqual(hours, [10, 12, 16]);
  for (const s of slots) {
    const p = jstParts(new Date(s.start));
    assert.ok(p.wd >= 1 && p.wd <= 5);
    assert.equal(Date.parse(s.end) - Date.parse(s.start), 60 * 60 * 1000);
  }
  // 3日後（10/8）から
  assert.equal(jstParts(new Date(slots[0].start)).d, 8);
});

test("予定の前後30分を避ける", () => {
  // 10/8 10:00-12:30 が埋まっている → 13:00 以降
  const busy = [{ start: jstDate(2026, 10, 8, 10).getTime(), end: jstDate(2026, 10, 8, 12, 30).getTime() }];
  const slots = pickSlots(now, busy, DEFAULT_SETTINGS);
  const p = jstParts(new Date(slots[0].start));
  assert.equal(p.d, 8);
  assert.equal(p.hh, 13);
});

test("終日埋まっている日は飛ばす", () => {
  const busy = [{ start: jstDate(2026, 10, 8).getTime(), end: jstDate(2026, 10, 9).getTime() }];
  const slots = pickSlots(now, busy, DEFAULT_SETTINGS);
  assert.equal(jstParts(new Date(slots[0].start)).d, 9);
});

test("カードの並び：今日期限 → 相手待ち → お願い → 1to1提案", () => {
  const t = now.getTime();
  const cards = [
    { id: "p", type: "proposal", status: "open", createdAt: 1 },
    { id: "r", type: "request", status: "open", createdAt: 2, dueAt: t + 3 * 86400000 },
    { id: "th", type: "thanks", status: "open", createdAt: 3 },
    { id: "d", type: "lineReply", status: "open", createdAt: 4, dueAt: t + 3600000 },
    { id: "s", type: "request", status: "open", createdAt: 5, snoozedUntil: t + 1000 },
    { id: "x", type: "request", status: "done", createdAt: 6 },
  ];
  assert.deepEqual(sortCards(cards, t).map((c) => c.id), ["d", "th", "r", "p"]);
});

test("誘う順：まだの人 → 久しぶりの人。除外も効く", () => {
  const r = rankMembers(
    [
      { id: "a", name: "A", lastOneToOne: "2026-09-20" },
      { id: "b", name: "B", lastOneToOne: "2026-06-01" },
      { id: "c", name: "C" },
      { id: "d", name: "D", doNotInvite: true },
      { id: "e", name: "E", skippedOn: "2026-10-05" },
      { id: "f", name: "F" },
    ],
    new Set(["f"]),
    now,
    "2026-10-05",
  );
  assert.deepEqual(r.map((m) => m.id), ["c", "b", "a"]);
});

test("一服タイムの判定（15分以内）", () => {
  assert.equal(currentSmokeKey(jstDate(2026, 10, 5, 15, 7), ["10:30", "15:00"], "2026-10-05"), "2026-10-05 15:00");
  assert.equal(currentSmokeKey(jstDate(2026, 10, 5, 15, 15), ["10:30", "15:00"], "2026-10-05"), null);
});
