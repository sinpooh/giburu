import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp, DocumentData } from "firebase-admin/firestore";
import { setGlobalOptions, logger } from "firebase-functions/v2";
import { defineSecret } from "firebase-functions/params";
import { onCall, onRequest, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { randomBytes } from "node:crypto";

import { ALLOWED, AppSettings, DEFAULT_SETTINGS, REGION, appUrl } from "./config";
import { DAY, HOUR, MIN, endOfJstDay, fmtRange, fmtSlot, isWeekend, jstParts, startOfJstDay, startOfJstMonth, startOfNextJstMonth, ymd } from "./time";
import { Interval, Slot, currentSmokeKey, fillTemplate, pickSlots, rankMembers, slotsText, sortCards, periodLabel } from "./logic";
import { SCOPES, busyIntervals, createEvent, isConnected, oauthClient } from "./calendar";
import { push, pushUid } from "./push";

initializeApp();
// GoogleカレンダーのOAuthクライアント（Secret Manager に保存。docs/SETUP.md の手順で登録）
const GOOGLE_CLIENT_ID = defineSecret("GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = defineSecret("GOOGLE_CLIENT_SECRET");
setGlobalOptions({ region: REGION, maxInstances: 3, secrets: [GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET] });
const db = getFirestore();

const LINK_DAYS = 3;
const AOYAMA_EMAIL = Object.entries(ALLOWED).find(([, v]) => v.role === "aoyama")![0];

// ---------- 共通 ----------

async function getSettings(): Promise<AppSettings> {
  const snap = await db.doc("settings/app").get();
  // 空欄の項目は既定値を使う
  const saved = Object.fromEntries(
    Object.entries(snap.data() ?? {}).filter(([, v]) => v !== "" && v != null && !(Array.isArray(v) && v.length === 0)),
  );
  return { ...DEFAULT_SETTINGS, ...saved } as AppSettings;
}

function requireAllowed(req: CallableRequest): string {
  const email = req.auth?.token.email;
  if (!req.auth || !email || !req.auth.token.email_verified || !ALLOWED[email]) {
    throw new HttpsError("permission-denied", "このアカウントでは使えません");
  }
  return req.auth.uid;
}

function bookingUrl(token: string): string {
  return `${appUrl()}/b/${token}`;
}

function lineShareUrl(text: string): string {
  return `https://line.me/R/share?text=${encodeURIComponent(text)}`;
}

/** 今月の1to1（確定＋実施済み）の件数 */
async function monthCount(now: Date): Promise<number> {
  const from = startOfJstMonth(now).toISOString();
  const to = startOfNextJstMonth(now).toISOString();
  const snap = await db.collection("oneToOnes").where("status", "in", ["confirmed", "done"]).get();
  return snap.docs.filter((d) => {
    const s = d.get("confirmedSlot")?.start;
    return s && s >= from && s < to;
  }).length;
}

/** カレンダーの予定＋ギブる内部の仮押さえ（返事待ちの枠など） */
async function allBusy(from: Date, to: Date): Promise<{ busy: Interval[]; calendar: boolean }> {
  const cal = await busyIntervals(from, to);
  const busy: Interval[] = cal ? [...cal] : [];
  const held = await db.collection("oneToOnes").where("status", "in", ["proposed", "waiting", "confirmed"]).get();
  for (const d of held.docs) {
    const slots: Slot[] = d.get("status") === "confirmed" ? [d.get("confirmedSlot")] : d.get("slots") ?? [];
    for (const s of slots) if (s) busy.push({ start: Date.parse(s.start), end: Date.parse(s.end) });
  }
  return { busy, calendar: cal != null };
}

type ProposalKind = "proposal" | "noReply" | "differentDay";

/**
 * 1to1の候補（相手・3枠・LINE文面）を作って、ホーム用のカードを1枚作る。
 * memberId を渡すとその人で作る（返事がまだ・別の日がいい）。
 */
async function createProposal(now: Date, kind: ProposalKind, memberId?: string): Promise<{ cardId: string } | { reason: string }> {
  const s = await getSettings();
  let member: DocumentData & { id: string };
  if (memberId) {
    const m = await db.doc(`members/${memberId}`).get();
    if (!m.exists) return { reason: "no-member" };
    member = { id: m.id, ...m.data()! };
  } else {
    const [ms, active] = await Promise.all([
      db.collection("members").get(),
      db.collection("oneToOnes").where("status", "in", ["proposed", "waiting", "confirmed"]).get(),
    ]);
    const busyIds = new Set(active.docs.map((d) => d.get("memberId") as string));
    const ranked = rankMembers(
      ms.docs.map((d) => ({ id: d.id, ...(d.data() as { name: string }) })),
      busyIds,
      now,
      ymd(now),
    );
    if (ranked.length === 0) return { reason: ms.empty ? "no-members" : "no-candidates" };
    member = ranked[0] as DocumentData & { id: string };
  }

  const from = new Date(startOfJstDay(now).getTime() + s.rangeStartDays * DAY);
  const to = new Date(startOfJstDay(now).getTime() + (s.rangeEndDays + 1) * DAY);
  const { busy, calendar } = await allBusy(from, to);
  const slots = pickSlots(now, busy, s);
  if (slots.length === 0) return { reason: "no-slots" };

  const token = randomBytes(18).toString("base64url");
  const tpl =
    kind === "noReply"
      ? s.resendTemplate
      : kind === "differentDay"
        ? s.differentDayTemplate
        : s.templates[Math.floor(Math.random() * s.templates.length)] ?? DEFAULT_SETTINGS.templates[0];
  const lineText = fillTemplate(tpl, { name: member.name, url: bookingUrl(token), slots: slotsText(slots) });

  const o = await db.collection("oneToOnes").add({
    memberId: member.id,
    memberName: member.name,
    company: member.company ?? "",
    industry: member.industry ?? "",
    memberEmail: member.email ?? "",
    status: "proposed",
    kind,
    slots,
    token,
    calendarChecked: calendar,
    createdAt: FieldValue.serverTimestamp(),
  });

  const hint = !member.lastOneToOne ? "まだ1to1したことがない人です" : `前回の1to1：${member.lastOneToOne}`;
  const titles: Record<ProposalKind, string> = {
    proposal: `${member.name}さん`,
    noReply: `${member.name}さんから返事がまだ`,
    differentDay: `${member.name}さん、別の日がいいって`,
  };
  const card = await db.collection("cards").add({
    type: kind,
    status: "open",
    title: titles[kind],
    sub: [member.company, member.industry && `（${member.industry}）`].filter(Boolean).join(""),
    hint: kind === "proposal" ? hint : kind === "noReply" ? "やわらかい再送文を用意しました" : "新しい候補を3つ用意しました",
    slots: slots.map((x) => ({ ...x, label: fmtSlot(new Date(x.start)), period: periodLabel(new Date(x.start)) })),
    oneToOneId: o.id,
    memberId: member.id,
    lineText,
    lineUrl: lineShareUrl(lineText),
    calendarChecked: calendar,
    dueAt: kind === "differentDay" ? Timestamp.fromDate(endOfJstDay(new Date(now.getTime() + DAY))) : null,
    createdBy: "system",
    createdAt: FieldValue.serverTimestamp(),
  });
  return { cardId: card.id };
}

/** 1to1提案カードが無ければ出す（平日1日1枚・返事待ちは2件まで・今月の目標まで） */
async function ensureProposal(now: Date, force: boolean): Promise<{ cardId?: string; reason?: string }> {
  const s = await getSettings();
  const open = await db.collection("cards").where("status", "==", "open").get();
  if (open.docs.some((d) => d.get("type") === "proposal")) return { reason: "already-open" };
  if (!force) {
    if (!s.includeWeekends && isWeekend(now)) return { reason: "weekend" };
    const state = await db.doc("state/tick").get();
    if (state.get("lastProposalDay") === ymd(now)) return { reason: "done-today" };
    const waiting = await db.collection("oneToOnes").where("status", "==", "waiting").get();
    if (waiting.size >= s.maxWaiting) return { reason: "too-many-waiting" };
    if ((await monthCount(now)) >= s.monthlyGoal) return { reason: "goal-reached" };
  }
  const r = await createProposal(now, "proposal");
  if ("cardId" in r) await db.doc("state/tick").set({ lastProposalDay: ymd(now) }, { merge: true });
  return r;
}

// ---------- 青山さん・店長の画面から呼ぶ ----------

/** 新しい1to1提案を出す（ホームの「1to1の候補を出す」） */
export const requestProposal = onCall(async (req) => {
  requireAllowed(req);
  return ensureProposal(new Date(), true);
});

/** 右スワイプ：LINEで送った → 返事待ちにする */
export const markSent = onCall(async (req) => {
  requireAllowed(req);
  const cardId = String(req.data?.cardId ?? "");
  const card = await db.doc(`cards/${cardId}`).get();
  if (!card.exists) throw new HttpsError("not-found", "カードがありません");
  const oRef = db.doc(`oneToOnes/${card.get("oneToOneId")}`);
  const now = new Date();
  await db.runTransaction(async (t) => {
    const o = await t.get(oRef);
    if (o.get("status") === "proposed") {
      t.update(oRef, {
        status: "waiting",
        sentAt: Timestamp.fromDate(now),
        expiresAt: Timestamp.fromDate(new Date(now.getTime() + LINK_DAYS * DAY)),
      });
    }
    t.update(card.ref, { status: "done", doneAt: FieldValue.serverTimestamp() });
  });
  return { ok: true };
});

/** 左スワイプ：別の人にする */
export const skipProposal = onCall(async (req) => {
  requireAllowed(req);
  const cardId = String(req.data?.cardId ?? "");
  const card = await db.doc(`cards/${cardId}`).get();
  if (!card.exists) throw new HttpsError("not-found", "カードがありません");
  const now = new Date();
  const batch = db.batch();
  batch.update(card.ref, { status: "dismissed", doneAt: FieldValue.serverTimestamp() });
  const oId = card.get("oneToOneId");
  if (oId) batch.update(db.doc(`oneToOnes/${oId}`), { status: "skipped" });
  const mId = card.get("memberId");
  if (mId) batch.update(db.doc(`members/${mId}`), { skippedOn: ymd(now) });
  await batch.commit();
  return createProposal(now, "proposal");
});

/** カレンダー連携の入口（Googleの許可画面のURLを返す） */
export const calendarAuthUrl = onCall(async (req) => {
  const uid = requireAllowed(req);
  const state = randomBytes(16).toString("hex");
  await db.doc(`private/oauthStates/items/${state}`).set({ uid, createdAt: FieldValue.serverTimestamp() });
  const url = oauthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state,
    login_hint: AOYAMA_EMAIL,
  });
  return { url };
});

/** Googleの許可画面から戻ってくる先（/api/calendar/callback） */
export const calendarOAuthCallback = onRequest(async (req, res) => {
  const back = (q: string) => res.redirect(`${appUrl()}/?calendar=${q}`);
  try {
    const state = String(req.query.state ?? "");
    const code = String(req.query.code ?? "");
    if (!state || !code) return back("cancel");
    const st = db.doc(`private/oauthStates/items/${state}`);
    const stSnap = await st.get();
    if (!stSnap.exists) return back("error");
    await st.delete();

    const client = oauthClient();
    const { tokens } = await client.getToken(code);
    if (!tokens.refresh_token) return back("error");
    let email = "";
    if (tokens.id_token) {
      const t = await client.verifyIdToken({ idToken: tokens.id_token, audience: process.env.GOOGLE_CLIENT_ID });
      email = t.getPayload()?.email ?? "";
    }
    await db.doc("private/calendar").set({ refreshToken: tokens.refresh_token, email, uid: stSnap.get("uid"), connectedAt: FieldValue.serverTimestamp() });
    await db.doc("settings/calendar").set({ connected: true, email, connectedAt: FieldValue.serverTimestamp() });
    return back(email && email !== AOYAMA_EMAIL ? "other-account" : "ok");
  } catch (e) {
    logger.error("calendar callback failed", e);
    return back("error");
  }
});

/** 通知のテスト */
export const sendTestPush = onCall(async (req) => {
  const uid = requireAllowed(req);
  const n = await pushUid(uid, "ギブる", "通知のテストです。届いたら成功！🎉", "/");
  return { sent: n };
});

/** その1to1の送る系カードがまだ開いていたら閉じる（送った記録が届く前に相手が選んだ場合など） */
async function closeCardsFor(oneToOneId: string) {
  const cards = await db.collection("cards").where("oneToOneId", "==", oneToOneId).get();
  for (const c of cards.docs) {
    if (c.get("status") === "open" && ["proposal", "noReply", "differentDay"].includes(c.get("type"))) {
      await c.ref.update({ status: "done", doneAt: FieldValue.serverTimestamp() });
    }
  }
}

// ---------- 相手用の候補選択ページ（ログイン不要） ----------

async function findByToken(token: string) {
  if (!token || token.length < 20) return null;
  const q = await db.collection("oneToOnes").where("token", "==", token).limit(1).get();
  return q.empty ? null : q.docs[0];
}

/** リンクの期限。LINEを開いた直後に「送った」の記録が届かなくても、作成から3日で切れる */
function linkExpiry(o: FirebaseFirestore.DocumentSnapshot): number | null {
  const exp: Timestamp | undefined = o.get("expiresAt");
  if (exp) return exp.toMillis();
  const created: Timestamp | undefined = o.get("createdAt");
  return created ? created.toMillis() + LINK_DAYS * DAY : null;
}
const OPEN_LINK = ["proposed", "waiting"];

export const getBooking = onCall(async (req) => {
  const o = await findByToken(String(req.data?.token ?? ""));
  if (!o) return { status: "notfound" };
  const s = await getSettings();
  const status = o.get("status");
  const exp = linkExpiry(o);
  const expired = OPEN_LINK.includes(status) && exp != null && exp < Date.now();
  const slots: (Slot & { taken?: boolean })[] = o.get("slots") ?? [];
  return {
    status: expired ? "expired" : status,
    memberName: o.get("memberName"),
    format: s.format,
    durationMin: s.durationMin,
    expiresAt: exp,
    slots: slots.map((x) => ({ start: x.start, end: x.end, taken: !!x.taken, label: fmtRange(new Date(x.start), new Date(x.end)), period: periodLabel(new Date(x.start)) })),
    confirmed: o.get("confirmedSlot") ?? null,
    meetingUrl: status === "confirmed" && s.format === "online" ? s.meetingUrl : "",
  };
});

export const confirmBooking = onCall(async (req) => {
  const o = await findByToken(String(req.data?.token ?? ""));
  const index = Number(req.data?.index);
  if (!o) throw new HttpsError("not-found", "リンクが見つかりません");
  const s = await getSettings();
  const slots: (Slot & { taken?: boolean })[] = o.get("slots") ?? [];
  const slot = slots[index];
  if (!slot || slot.taken) throw new HttpsError("invalid-argument", "その枠は選べません");

  // 選んだ瞬間にカレンダーを再チェック
  const start = Date.parse(slot.start);
  const end = Date.parse(slot.end);
  const cal = await busyIntervals(new Date(start - s.bufferMin * MIN), new Date(end + s.bufferMin * MIN));
  if (cal && cal.some((b) => b.start < end && b.end > start)) {
    slots[index] = { ...slot, taken: true };
    await o.ref.update({ slots });
    return { ok: false, reason: "taken" };
  }

  const ok = await db.runTransaction(async (t) => {
    const cur = await t.get(o.ref);
    const exp = linkExpiry(cur);
    if (!OPEN_LINK.includes(cur.get("status")) || (exp != null && exp < Date.now())) return false;
    t.update(o.ref, { status: "confirmed", confirmedSlot: { start: slot.start, end: slot.end }, confirmedAt: FieldValue.serverTimestamp() });
    return true;
  });
  if (!ok) throw new HttpsError("failed-precondition", "このリンクはもう使えません");

  const member = await db.doc(`members/${o.get("memberId")}`).get();
  const location = s.format === "online" ? s.meetingUrl || "オンライン" : "対面（場所は調整）";
  const desc = [
    member.get("industry") && `業種：${member.get("industry")}`,
    member.get("memo") && `メモ：${member.get("memo")}`,
    member.get("lastOneToOne") && `前回の1to1：${member.get("lastOneToOne")}`,
    "（ギブるで調整）",
  ]
    .filter(Boolean)
    .join("\n");
  let eventId: string | null = null;
  try {
    eventId = await createEvent({
      summary: `1to1 ${o.get("memberName")}さん${o.get("company") ? `（${o.get("company")}）` : ""}`,
      description: desc,
      location,
      start: slot.start,
      end: slot.end,
      attendeeEmail: member.get("email") || null,
    });
  } catch (e) {
    logger.error("createEvent failed", e);
  }
  await o.ref.update({ eventId });
  await closeCardsFor(o.id);

  const now = new Date();
  const count = await monthCount(now);
  const goal = s.monthlyGoal;
  const when = fmtSlot(new Date(slot.start));
  const milestone = count === goal;
  await db.collection("cards").add({
    type: "confirmed",
    status: "open",
    title: `${o.get("memberName")}さんと ${when}`,
    sub: eventId ? "カレンダーに入れときました" : "（カレンダー未連携のため手で登録してください）",
    oneToOneId: o.id,
    memberId: o.get("memberId"),
    monthCount: count,
    milestone,
    dueAt: null,
    createdBy: "system",
    createdAt: FieldValue.serverTimestamp(),
  });
  await push("aoyama", "決まった！🎉", `${o.get("memberName")}さんと ${when} に1to1。今月 ${count}/${goal}件`, "/");
  await push("managerNotify", "1to1が決まりました", `青山さん × ${o.get("memberName")}さん ${when}（今月 ${count}/${goal}件）`, "/");
  if (milestone) await push("managers", "今月の1to1目標達成！🎉", `青山さんが今月${goal}件を達成しました。褒めてあげてください！`, "/");
  return { ok: true, start: slot.start, end: slot.end, meetingUrl: s.format === "online" ? s.meetingUrl : "" };
});

/** 「どれも合わない」 */
export const declineBooking = onCall(async (req) => {
  const o = await findByToken(String(req.data?.token ?? ""));
  if (!o) throw new HttpsError("not-found", "リンクが見つかりません");
  const ok = await db.runTransaction(async (t) => {
    const cur = await t.get(o.ref);
    if (!OPEN_LINK.includes(cur.get("status"))) return false;
    t.update(o.ref, { status: "declined", declinedAt: FieldValue.serverTimestamp() });
    return true;
  });
  if (!ok) throw new HttpsError("failed-precondition", "このリンクはもう使えません");
  await closeCardsFor(o.id);
  await createProposal(new Date(), "differentDay", o.get("memberId"));
  await push("aoyama", "ギブる", `${o.get("memberName")}さん、別の日がいいって。スワイプ1回で新しい候補を送れるよ`, "/");
  return { ok: true };
});

// ---------- 褒める ----------

export const onPraiseCreated = onDocumentCreated("praises/{id}", async (ev) => {
  const text = ev.data?.get("text") || "いいね！";
  const by = ev.data?.get("byName") || "シンプー";
  await push("aoyama", `${by}さんから👏`, text, "/");
});

// ---------- 15分ごとの定期処理 ----------

const OVERDUE_NOTIFY_TYPES = ["request", "lineReply", "thanks", "differentDay"];

export const tick = onSchedule({ schedule: "every 15 minutes", timeZone: "Asia/Tokyo" }, async () => {
  const now = new Date();
  const s = await getSettings();

  // 1) 3日たっても返事がない → 「返事がまだ」カード
  const waiting = await db.collection("oneToOnes").where("status", "==", "waiting").get();
  for (const o of waiting.docs) {
    const exp: Timestamp | undefined = o.get("expiresAt");
    if (exp && exp.toMillis() < now.getTime()) {
      await o.ref.update({ status: "expired" });
      await createProposal(now, "noReply", o.get("memberId"));
    }
  }

  // 1b) 送らないまま3日たった候補は仮押さえを外す（返事がまだ・別の日がいいは新しい候補で出し直す）
  const proposed = await db.collection("oneToOnes").where("status", "==", "proposed").get();
  for (const o of proposed.docs) {
    const exp = linkExpiry(o);
    if (exp == null || exp >= now.getTime()) continue;
    await o.ref.update({ status: "expired" });
    const cards = await db.collection("cards").where("oneToOneId", "==", o.id).get();
    for (const c of cards.docs) if (c.get("status") === "open") await c.ref.update({ status: "dismissed" });
    if (o.get("kind") !== "proposal") await createProposal(now, o.get("kind"), o.get("memberId"));
  }

  // 2) 確定済み：前日20時のカード／終了15分後のお礼カード
  const confirmed = await db.collection("oneToOnes").where("status", "==", "confirmed").get();
  const p = jstParts(now);
  for (const o of confirmed.docs) {
    const slot: Slot = o.get("confirmedSlot");
    const start = new Date(slot.start);
    const end = new Date(slot.end);
    const tomorrow = ymd(new Date(now.getTime() + DAY));
    if (!o.get("eveCard") && ymd(start) === tomorrow && p.hh >= 20) {
      await db.collection("cards").add({
        type: "tomorrow",
        status: "open",
        title: `明日 ${o.get("memberName")}さんと1to1`,
        sub: fmtRange(start, end) + (s.format === "online" ? "・オンライン" : "・対面"),
        oneToOneId: o.id,
        dueAt: Timestamp.fromDate(endOfJstDay(start)),
        createdBy: "system",
        createdAt: FieldValue.serverTimestamp(),
      });
      await o.ref.update({ eveCard: true });
    }
    if (now.getTime() >= end.getTime() + 15 * MIN) {
      const lineText = fillTemplate(s.thanksTemplate, { name: o.get("memberName") });
      await o.ref.update({ status: "done" });
      await db.doc(`members/${o.get("memberId")}`).set({ lastOneToOne: ymd(start) }, { merge: true });
      await db.collection("cards").add({
        type: "thanks",
        status: "open",
        title: `${o.get("memberName")}さんにお礼送る？`,
        sub: "お礼の文面を用意しました",
        oneToOneId: o.id,
        memberId: o.get("memberId"),
        lineText,
        lineUrl: lineShareUrl(lineText),
        dueAt: Timestamp.fromDate(endOfJstDay(now)),
        createdBy: "system",
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  }

  // 3) 一服タイム：その時いちばん上のカードを1枚だけ通知（期限が近いものは1回だけやさしく催促）
  const key = currentSmokeKey(now, s.smokeTimes, ymd(now));
  const stateRef = db.doc("state/tick");
  const state = await stateRef.get();
  if (key && state.get("lastSmokeKey") !== key && (s.weekendNotify || !isWeekend(now))) {
    await stateRef.set({ lastSmokeKey: key }, { merge: true });
    try {
      await ensureProposal(now, false);
    } catch (e) {
      logger.error("ensureProposal failed", e);
    }
    const open = await db.collection("cards").where("status", "==", "open").get();
    const cards = open.docs.map((d) => ({
      id: d.id,
      ref: d.ref,
      type: d.get("type") as string,
      status: "open",
      title: d.get("title") as string,
      nudged: !!d.get("nudged"),
      dueAt: (d.get("dueAt") as Timestamp | null)?.toMillis() ?? null,
      snoozedUntil: (d.get("snoozedUntil") as Timestamp | null)?.toMillis() ?? null,
      createdAt: (d.get("createdAt") as Timestamp | null)?.toMillis() ?? 0,
    }));
    const top = sortCards(cards, now.getTime())[0];
    if (top) {
      const dueSoon = top.dueAt && top.dueAt - now.getTime() < 24 * HOUR && top.dueAt > now.getTime();
      if (dueSoon && !top.nudged && OVERDUE_NOTIFY_TYPES.includes(top.type)) {
        await top.ref.update({ nudged: true });
        await push("aoyama", "ギブる", `「${top.title}」今日までだよ〜。スワイプ1回で終わるよ`, `/?card=${top.id}`);
      } else {
        const lines = cards.filter((c) => c.type === "lineReply" && c.id !== top.id && (!c.snoozedUntil || c.snoozedUntil <= now.getTime())).length;
        const extra = lines ? `／LINE返信もあと${lines}件` : "";
        await push("aoyama", "一服タイム☕", `今日の1枚：${top.title}（スワイプ1回）${extra}`, `/?card=${top.id}`);
      }
    }
  }

  // 4) 期限切れ → シンプーさんに1回だけ通知
  const open = await db.collection("cards").where("status", "==", "open").get();
  for (const c of open.docs) {
    const due: Timestamp | null = c.get("dueAt");
    if (!due || due.toMillis() >= now.getTime() || c.get("managerNotified")) continue;
    if (!OVERDUE_NOTIFY_TYPES.includes(c.get("type"))) continue;
    await c.ref.update({ managerNotified: true });
    await push("managerNotify", "期限切れ", `青山さんの「${c.get("title")}」が期限切れになりました`, "/");
  }
});

// 連携状態の確認（設定画面）
export const calendarStatus = onCall(async (req) => {
  requireAllowed(req);
  return { connected: await isConnected() };
});
