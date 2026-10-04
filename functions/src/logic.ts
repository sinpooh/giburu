// 計算だけの部分（Firestore やカレンダーに触らないのでテストしやすい）
import { AppSettings } from "./config";
import { DAY, MIN, jstDate, jstParts, parseHm, startOfJstDay, fmtSlot } from "./time";

export interface Interval {
  start: number;
  end: number;
}
export interface Slot {
  start: string;
  end: string;
}

function period(minOfDay: number): number {
  if (minOfDay < 12 * 60) return 0; // 午前
  if (minOfDay < 16 * 60) return 1; // 午後
  return 2; // 夕方
}

export function periodLabel(start: Date): string {
  const p = jstParts(start);
  return ["午前", "午後", "夕方"][period(p.hh * 60 + p.mm)];
}

/**
 * 空き枠を3つ選ぶ。
 * - 予定（busy）の前後に余白を取る
 * - 3つは別々の日、なるべく午前・午後・夕方に散らす
 */
export function pickSlots(now: Date, busy: Interval[], s: AppSettings, count = 3): Slot[] {
  const dur = s.durationMin * MIN;
  const buf = s.bufferMin * MIN;
  const ws = parseHm(s.workStart);
  const we = parseHm(s.workEnd);
  const today = startOfJstDay(now);
  const result: Slot[] = [];
  const used = new Set<number>();

  for (let i = s.rangeStartDays; i <= s.rangeEndDays && result.length < count; i++) {
    const day = new Date(today.getTime() + i * DAY + 12 * 60 * MIN); // 正午で日付を確定
    const p = jstParts(day);
    if (!s.includeWeekends && (p.wd === 0 || p.wd === 6)) continue;

    const free: { start: number; per: number }[] = [];
    for (let m = ws; m + s.durationMin <= we; m += 30) {
      const start = jstDate(p.y, p.m, p.d, Math.floor(m / 60), m % 60).getTime();
      const end = start + dur;
      const clash = busy.some((b) => b.start < end + buf && b.end > start - buf);
      if (!clash) free.push({ start, per: period(m) });
    }
    if (free.length === 0) continue;

    // まだ使っていない時間帯を優先。午前・午後・夕方を順番に回す
    const want = [0, 1, 2].filter((x) => !used.has(x));
    const pick = free.find((f) => want.includes(f.per)) ?? free[0];
    used.add(pick.per);
    if (used.size === 3) used.clear();
    result.push({ start: new Date(pick.start).toISOString(), end: new Date(pick.start + dur).toISOString() });
  }
  return result;
}

export function slotsText(slots: Slot[]): string {
  return slots.map((x) => fmtSlot(new Date(x.start))).join(" ／ ");
}

export function fillTemplate(t: string, vars: Record<string, string>): string {
  return t.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

export interface MemberLike {
  id: string;
  name: string;
  joinedAt?: string | null;
  lastOneToOne?: string | null;
  doNotInvite?: boolean;
  skippedOn?: string | null;
}

/** 次に誘う人の順番（一度もしていない人 → 久しぶりの人。新メンバーは少し優先） */
export function rankMembers(members: MemberLike[], busyIds: Set<string>, now: Date, todayYmd: string): MemberLike[] {
  const score = (m: MemberLike) => {
    const days = m.lastOneToOne ? (now.getTime() - Date.parse(m.lastOneToOne)) / DAY : 10000;
    const isNew = m.joinedAt ? (now.getTime() - Date.parse(m.joinedAt)) / DAY < 90 : false;
    return days + (isNew ? 60 : 0);
  };
  return members
    .filter((m) => !m.doNotInvite && !busyIds.has(m.id) && m.skippedOn !== todayYmd)
    .sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name, "ja"));
}

export interface CardLike {
  id: string;
  type: string;
  status: string;
  dueAt?: number | null;
  snoozedUntil?: number | null;
  createdAt?: number;
}

const WAITING_OTHERS = ["differentDay", "thanks", "noReply", "confirmed", "tomorrow"];

/** ホームに出す順番。web/src/lib/cards.ts と同じルール */
export function sortCards<T extends CardLike>(cards: T[], now: number): T[] {
  const endToday = startOfJstDay(new Date(now)).getTime() + DAY;
  const rank = (c: T) => {
    if (c.dueAt && c.dueAt < endToday) return 0;
    if (WAITING_OTHERS.includes(c.type)) return 1;
    if (c.type === "request" || c.type === "lineReply") return 2;
    return 3;
  };
  return cards
    .filter((c) => c.status === "open" && (!c.snoozedUntil || c.snoozedUntil <= now))
    .sort((a, b) => rank(a) - rank(b) || (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity) || (a.createdAt ?? 0) - (b.createdAt ?? 0));
}

/** 今の時刻が一服タイム（15分以内）ならその "YYYY-MM-DD HH:MM" を返す */
export function currentSmokeKey(now: Date, times: string[], todayYmd: string): string | null {
  const p = jstParts(now);
  const cur = p.hh * 60 + p.mm;
  for (const t of times) {
    const m = parseHm(t);
    if (cur >= m && cur < m + 15) return `${todayYmd} ${t}`;
  }
  return null;
}
