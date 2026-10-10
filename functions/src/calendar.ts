// Googleカレンダー連携（合鍵＝リフレッシュトークンはサーバ側 private/calendar にだけ保存）
import { OAuth2Client } from "google-auth-library";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { appUrl } from "./config";
import { Interval } from "./logic";

export const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.events"];

export function oauthClient(): OAuth2Client {
  // 貼り付けたときに紛れ込んだ空白・改行は取り除く
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
  transparency?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
}

/** 予定ありの時間帯。終日予定は「空き」扱いの設定でもその日全体を埋める */
export async function busyIntervals(from: Date, to: Date): Promise<Interval[] | null> {
  const c = await authedClient();
  if (!c) return null;
  const out: Interval[] = [];
  let pageToken: string | undefined;
  do {
    const q = new URLSearchParams({
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      singleEvents: "true",
      maxResults: "250",
    });
    if (pageToken) q.set("pageToken", pageToken);
    const data = await call<{ items?: GEvent[]; nextPageToken?: string }>(c, `${BASE}/events?${q}`);
    for (const ev of data.items ?? []) {
      if (ev.status === "cancelled") continue;
      if (ev.start?.date && ev.end?.date) {
        // 終日予定：日本時間のその日まるごと
        out.push({ start: Date.parse(`${ev.start.date}T00:00:00+09:00`), end: Date.parse(`${ev.end.date}T00:00:00+09:00`) });
      } else if (ev.start?.dateTime && ev.end?.dateTime) {
        if (ev.transparency === "transparent") continue;
        out.push({ start: Date.parse(ev.start.dateTime), end: Date.parse(ev.end.dateTime) });
      }
    }
    pageToken = data.nextPageToken;
  } while (pageToken);
  return out;
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
    reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 60 }] },
  };
  const q = ev.attendeeEmail ? "?sendUpdates=all" : "";
  const data = await call<{ id: string }>(c, `${BASE}/events${q}`, { method: "POST", body });
  return data.id;
}
