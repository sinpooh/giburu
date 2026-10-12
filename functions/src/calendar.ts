import { logger } from "firebase-functions/v2";
// Googleカレンダー連携（合鍵＝リフレッシュトークンはサーバ側 private/calendar にだけ保存）
import { OAuth2Client } from "google-auth-library";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { appUrl } from "./config";
import { Interval } from "./logic";

// calendarlist.readonly：お店の予定など、青山さんのアカウントに入っている別のカレンダーも読むため（2026-10-12 追加。つなぎ直しが必要）
export const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/calendar.calendarlist.readonly"];

export function oauthClient(): OAuth2Client {
  // 貼り付けたときに紛れ込んだ空白・改行は取り除く（シークレットを入れ直したら関数の公開し直しが必要）
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET が設定されていません");
  return new OAuth2Client(clientId, clientSecret, `${appUrl()}/api/calendar/callback`);
}

async function authedClient(): Promise<OAuth2Client | null> {
  const snap = await getFirestore().doc("private/calendar").get();
  const refreshToken = snap.get("refreshToken");
  if (!refreshToken) return null;
  const c = oauthClient();
  c.setCredentials({ refresh_token: refreshToken });
  return c;
}

export async function isConnected(): Promise<boolean> {
  return (await getFirestore().doc("private/calendar").get()).get("refreshToken") != null;
}

async function call<T>(c: OAuth2Client, url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  try {
    const res = await c.request<T>({ url, method: (init?.method as "GET" | "POST") ?? "GET", data: init?.body });
    return res.data;
  } catch (e: unknown) {
    const msg = String((e as Error)?.message ?? e);
    if (msg.includes("invalid_grant")) {
      // 連携が切れた（同意画面がテスト状態のまま7日経過、または許可の取り消し）
      await getFirestore().doc("private/calendar").delete();
      await getFirestore().doc("settings/calendar").set({ connected: false, brokenAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    throw e;
  }
}

const BASE = "https://www.googleapis.com/calendar/v3/calendars/primary";

interface GEvent {
  status?: string;
  colorId?: string;
  summary?: string;
  transparency?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
}

export interface CalEvent {
  title: string;
  /** Googleカレンダーの予定の色（1〜11）。無ければカレンダーの色 */
  color?: string;
  start: number;
  end: number;
  allDay: boolean;
  avoided: boolean; // 1to1の候補からよけているか（「空き」扱いの時間指定の予定はよけない）
}

/** 青山さんのカレンダー（いつもの自分のカレンダー）の予定。つながっていなければ null */
const API = "https://www.googleapis.com/calendar/v3";

/**
 * 読むカレンダーの一覧。カレンダーアプリで表示しているもの（お店の共有カレンダーなど）すべて。
 * 祝日・誕生日のカレンダーは除く。まだつなぎ直していない（権限がない）ときは自分のカレンダーだけ
 */
async function calendarsToRead(c: OAuth2Client): Promise<{ ids: { id: string; color?: string; name: string }[]; all: boolean }> {
  try {
    const data = await call<{ items?: { id: string; summary?: string; summaryOverride?: string; selected?: boolean; hidden?: boolean; primary?: boolean; backgroundColor?: string }[] }>(c, `${API}/users/me/calendarList?minAccessRole=freeBusyReader`);
    const ids = (data.items ?? [])
      .filter((x) => x.primary || (x.selected && !x.hidden))
      .filter((x) => !/#holiday@|#contacts@|#weeknum@/.test(x.id))
      .map((x) => ({ id: x.primary ? "primary" : x.id, color: x.backgroundColor, name: x.summaryOverride || x.summary || x.id }));
    return { ids: ids.length ? ids : [{ id: "primary", name: "メイン" }], all: true };
  } catch (e) {
    if (String((e as Error)?.message ?? e).includes("invalid_grant")) throw e;
    logger.warn("calendarList failed (つなぎ直し前?)", String((e as Error)?.message ?? e).slice(0, 200));
    return { ids: [{ id: "primary", name: "メイン" }], all: false };
  }
}

/** 最後に読んだとき、別のカレンダーまで読めたか（つなぎ直しが必要かの判定用） */
export let lastReadAll = false;
/** 最後に読んだカレンダーの名前（画面に「見ているカレンダー」として出す） */
export let lastCalendars: string[] = [];

export async function calendarEvents(from: Date, to: Date): Promise<CalEvent[] | null> {
  const c = await authedClient();
  if (!c) return null;
  const { ids, all } = await calendarsToRead(c);
  lastReadAll = all;
  lastCalendars = [];
  const out: CalEvent[] = [];
  for (const cal of ids) {
    try {
      await readCalendar(c, cal.id, cal.color, from, to, out);
      lastCalendars.push(cal.name);
    } catch (e) {
      logger.warn("calendar read failed", cal.id === "primary" ? "primary" : "other", String((e as Error)?.message ?? e).slice(0, 200));
      if (cal.id === "primary") throw e; // 別のカレンダーが読めないだけなら、ほかは続ける
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

async function readCalendar(c: OAuth2Client, calId: string, calColor: string | undefined, from: Date, to: Date, out: CalEvent[]) {
  let pageToken: string | undefined;
  do {
    const q = new URLSearchParams({
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
    });
    if (pageToken) q.set("pageToken", pageToken);
    const data = await call<{ items?: GEvent[]; nextPageToken?: string }>(c, `${API}/calendars/${encodeURIComponent(calId)}/events?${q}`);
    for (const ev of data.items ?? []) {
      if (ev.status === "cancelled") continue;
      const title = ev.summary || "（タイトルなし）";
      if (ev.start?.date && ev.end?.date) {
        // 終日予定：日本時間のその日まるごと
        out.push({ title, color: ev.colorId ?? calColor, start: Date.parse(`${ev.start.date}T00:00:00+09:00`), end: Date.parse(`${ev.end.date}T00:00:00+09:00`), allDay: true, avoided: true });
      } else if (ev.start?.dateTime && ev.end?.dateTime) {
        out.push({ title, color: ev.colorId ?? calColor, start: Date.parse(ev.start.dateTime), end: Date.parse(ev.end.dateTime), allDay: false, avoided: ev.transparency !== "transparent" });
      }
    }
    pageToken = data.nextPageToken;
  } while (pageToken);
}

/** 予定ありの時間帯。終日予定は「空き」扱いの設定でもその日全体を埋める */
export async function busyIntervals(from: Date, to: Date): Promise<Interval[] | null> {
  const evs = await calendarEvents(from, to);
  return evs && evs.filter((e) => e.avoided).map((e) => ({ start: e.start, end: e.end }));
}

export async function createEvent(ev: {
  summary: string;
  description: string;
  location: string;
  start: string;
  end: string;
  attendeeEmail?: string | null;
}): Promise<string | null> {
  const c = await authedClient();
  if (!c) return null;
  const body = {
    summary: ev.summary,
    description: ev.description,
    location: ev.location,
    start: { dateTime: ev.start, timeZone: "Asia/Tokyo" },
    end: { dateTime: ev.end, timeZone: "Asia/Tokyo" },
    attendees: ev.attendeeEmail ? [{ email: ev.attendeeEmail }] : undefined,
    colorId: "5", // 黄色（バナナ）。2026-10-10 シンプーさん指定
    reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 60 }] },
  };
  const q = ev.attendeeEmail ? "?sendUpdates=all" : "";
  const data = await call<{ id: string }>(c, `${BASE}/events${q}`, { method: "POST", body });
  return data.id;
}

/** 予定を消す（招待した相手にも取り消しが届く） */
export async function deleteEvent(id: string): Promise<void> {
  const c = await authedClient();
  if (!c) return;
  try {
    await c.request({ url: `${BASE}/events/${encodeURIComponent(id)}?sendUpdates=all`, method: "DELETE" });
  } catch (e: unknown) {
    const code = (e as { response?: { status?: number } })?.response?.status;
    if (code !== 404 && code !== 410) throw e; // もう消えているならOK
  }
}
