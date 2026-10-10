// 日本時間で計算・表示する
const JST = 9 * 3600 * 1000;
export const DAY = 86400000;
const WD = ["日", "月", "火", "水", "木", "金", "土"];

export function jst(d: Date | number) {
  const j = new Date((typeof d === "number" ? d : d.getTime()) + JST);
  return { y: j.getUTCFullYear(), m: j.getUTCMonth() + 1, d: j.getUTCDate(), hh: j.getUTCHours(), mm: j.getUTCMinutes(), wd: j.getUTCDay() };
}
export function jstDate(y: number, m: number, d: number, hh = 0, mm = 0): Date {
  return new Date(Date.UTC(y, m - 1, d, hh, mm) - JST);
}
export function startOfDay(t: number): number {
  const p = jst(t);
  return jstDate(p.y, p.m, p.d).getTime();
}
export function endOfDay(t: number): number {
  return startOfDay(t) + DAY - 1;
}
/** リファーラルの週のはじまり（木曜0時）。入力の締め切りが水曜・定例会が金曜（2026-10-10 シンプーさん） */
export function startOfRefWeek(t: number): number {
  const p = jst(t);
  return startOfDay(t) - ((p.wd + 3) % 7) * DAY;
}
export function startOfMonth(t: number): number {
  const p = jst(t);
  return jstDate(p.y, p.m, 1).getTime();
}
export function startOfNextMonth(t: number): number {
  const p = jst(t);
  return jstDate(p.m === 12 ? p.y + 1 : p.y, p.m === 12 ? 1 : p.m + 1, 1).getTime();
}
export function ymd(t: number): string {
  const p = jst(t);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}
const pad = (n: number) => String(n).padStart(2, "0");
export function fmtDay(t: number): string {
  const p = jst(t);
  return `${p.m}/${p.d}(${WD[p.wd]})`;
}
export function fmtTime(t: number): string {
  const p = jst(t);
  return `${p.hh}:${pad(p.mm)}`;
}
export function fmtDateTime(t: number): string {
  return `${fmtDay(t)} ${fmtTime(t)}`;
}
export function fmtRange(s: number, e: number): string {
  return `${fmtDay(s)} ${fmtTime(s)}〜${fmtTime(e)}`;
}
/** 残り時間を 5:12:40 の形に */
export function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}
export function hm(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + (m || 0);
}
/** 次の一服タイム（「あとで」の戻り先） */
export function nextSmokeTime(now: number, times: string[], weekendNotify: boolean): number {
  const sorted = [...times].sort((a, b) => hm(a) - hm(b));
  for (let i = 0; i < 8; i++) {
    const dayStart = startOfDay(now) + i * DAY;
    const p = jst(dayStart + 12 * 3600000);
    if (!weekendNotify && (p.wd === 0 || p.wd === 6)) continue;
    for (const t of sorted) {
      const at = dayStart + hm(t) * 60000;
      if (at > now + 60000) return at;
    }
  }
  return now + 3 * 3600000;
}
