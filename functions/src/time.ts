// 日本時間（UTC+9、夏時間なし）の計算まわり
const JST = 9 * 60 * 60 * 1000;
export const MIN = 60 * 1000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

/** 日本時間での年月日・時分・曜日 */
export function jstParts(d: Date) {
  const j = new Date(d.getTime() + JST);
  return {
    y: j.getUTCFullYear(),
    m: j.getUTCMonth() + 1,
    d: j.getUTCDate(),
    hh: j.getUTCHours(),
    mm: j.getUTCMinutes(),
    wd: j.getUTCDay(),
  };
}

/** 日本時間の y/m/d hh:mm を Date にする（m は1始まり） */
export function jstDate(y: number, m: number, d: number, hh = 0, mm = 0): Date {
  return new Date(Date.UTC(y, m - 1, d, hh, mm) - JST);
}

export function startOfJstDay(d: Date): Date {
  const p = jstParts(d);
  return jstDate(p.y, p.m, p.d);
}

export function endOfJstDay(d: Date): Date {
  return new Date(startOfJstDay(d).getTime() + DAY - 1);
}

export function startOfJstMonth(d: Date): Date {
  const p = jstParts(d);
  return jstDate(p.y, p.m, 1);
}

export function startOfNextJstMonth(d: Date): Date {
  const p = jstParts(d);
  return jstDate(p.m === 12 ? p.y + 1 : p.y, p.m === 12 ? 1 : p.m + 1, 1);
}

export function ymd(d: Date): string {
  const p = jstParts(d);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

export function parseHm(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + (m || 0);
}

const WD = ["日", "月", "火", "水", "木", "金", "土"];

/** 10/9(木)10:00 */
export function fmtSlot(start: Date): string {
  const p = jstParts(start);
  return `${p.m}/${p.d}(${WD[p.wd]})${p.hh}:${String(p.mm).padStart(2, "0")}`;
}

/** 10/9(木)10:00〜11:00 */
export function fmtRange(start: Date, end: Date): string {
  const e = jstParts(end);
  return `${fmtSlot(start)}〜${e.hh}:${String(e.mm).padStart(2, "0")}`;
}

export function isWeekend(d: Date): boolean {
  const wd = jstParts(d).wd;
  return wd === 0 || wd === 6;
}
