import { addDoc, collection, deleteDoc, doc, increment, limit, orderBy, query, serverTimestamp, setDoc, Timestamp, updateDoc, where } from "firebase/firestore";
import { call, db } from "../firebase";
import { startOfMonth, startOfNextMonth } from "./time";
import { lineUrlFor } from "./replies";

export interface Slot {
  start: string;
  end: string;
}
export interface OneToOne {
  id: string;
  memberId: string;
  memberName: string;
  company?: string;
  status: "proposed" | "waiting" | "confirmed" | "done" | "skipped" | "expired" | "declined";
  slots: Slot[];
  confirmedSlot?: Slot;
  sentAt?: Timestamp;
  expiresAt?: Timestamp;
  eventId?: string | null;
}
export interface Member {
  id: string;
  name: string;
  company?: string;
  industry?: string;
  lineName?: string;
  email?: string;
  joinedAt?: string;
  lastOneToOne?: string | null;
  memo?: string;
  doNotInvite?: boolean;
}

export const openCardsQuery = () => query(collection(db, "cards"), where("status", "==", "open"));
export const activeOneToOnesQuery = () =>
  query(collection(db, "oneToOnes"), where("status", "in", ["proposed", "waiting", "confirmed", "done"]));

export function monthStats(rows: OneToOne[] | null, now: number) {
  const from = new Date(startOfMonth(now)).toISOString();
  const to = new Date(startOfNextMonth(now)).toISOString();
  const inMonth = (o: OneToOne) => o.confirmedSlot && o.confirmedSlot.start >= from && o.confirmedSlot.start < to;
  const list = rows ?? [];
  return {
    confirmed: list.filter((o) => o.status === "confirmed" && inMonth(o)).length,
    done: list.filter((o) => o.status === "done" && inMonth(o)).length,
    waiting: list.filter((o) => o.status === "waiting").length,
    count: list.filter((o) => (o.status === "confirmed" || o.status === "done") && inMonth(o)).length,
  };
}

export const api = {
  requestProposal: call<void, { cardId?: string; reason?: string }>("requestProposal"),
  markSent: call<{ cardId: string }, { ok: boolean }>("markSent"),
  skipProposal: call<{ cardId: string }, { cardId?: string; reason?: string }>("skipProposal"),
  calendarAuthUrl: call<void, { url: string }>("calendarAuthUrl"),
  sendTestPush: call<void, { sent: number }>("sendTestPush"),
  getBooking: call<{ token: string }, BookingInfo>("getBooking"),
  confirmBooking: call<{ token: string; index: number; format: MeetFormat; address?: string }, { ok: boolean; reason?: string; start?: string; end?: string; meetingUrl?: string; format?: MeetFormat; place?: string }>("confirmBooking"),
  declineBooking: call<{ token: string }, { ok: boolean }>("declineBooking"),
  cancelOneToOne: call<{ id: string }, { ok: boolean; calendarOk?: boolean }>("cancelOneToOne"),
  summarizeTask: call<{ text: string; kind: TaskKind; images?: string[] }, { ok: boolean; summary?: TaskSummary; reason?: string }>("summarizeTask"),
};

/** 1to1のやり方。来店がいちばんのおすすめ */
export type MeetFormat = "store" | "online" | "visit";
export const FORMAT_LABEL: Record<MeetFormat, string> = { store: "来店", online: "Zoom", visit: "訪問" };

export interface BookingInfo {
  status: string;
  memberName?: string;
  formats?: MeetFormat[];
  durationMin?: number;
  shopAddress?: string;
  chosenFormat?: MeetFormat | null;
  place?: string;
  expiresAt?: number | null;
  slots?: { start: string; end: string; taken: boolean; label: string; period: string }[];
  confirmed?: Slot | null;
  meetingUrl?: string;
}

export function finishCard(id: string) {
  return updateDoc(doc(db, "cards", id), { status: "done", doneAt: serverTimestamp() });
}
export function snoozeCard(id: string, until: number) {
  return updateDoc(doc(db, "cards", id), { snoozedUntil: Timestamp.fromMillis(until) });
}

export function addTask(t: { type: "request" | "lineReply"; title: string; detail?: string; dueAt: number | null; byName: string; byUid: string }) {
  return addDoc(collection(db, "cards"), {
    type: t.type,
    status: "open",
    title: t.title,
    detail: t.detail ?? "",
    dueAt: t.dueAt ? Timestamp.fromMillis(t.dueAt) : null,
    createdBy: t.byUid,
    createdByName: t.byName,
    createdAt: serverTimestamp(),
  });
}

export function addLineReply(t: { name: string; lineText: string; dueAt: number; quote?: string; byName: string; byUid: string }) {
  return addDoc(collection(db, "cards"), {
    type: "lineReply",
    status: "open",
    title: `${t.name}さんにLINE返信`,
    sub: t.lineText ? "返信の文面、用意しときました" : "",
    ...(t.quote ? { detail: `相手のメッセージ：${t.quote.slice(0, 300)}` } : {}),
    lineText: t.lineText,
    lineUrl: lineUrlFor(t.lineText),
    dueAt: Timestamp.fromMillis(t.dueAt),
    createdBy: t.byUid,
    createdByName: t.byName,
    createdAt: serverTimestamp(),
  });
}

export const REASONS: Record<string, string> = {
  "no-members": "メンバーがまだ登録されていません。メンバー画面から追加してね",
  "no-candidates": "今日誘える人はもういません。また明日！",
  "no-slots": "2週間先まで空きが見つかりませんでした",
  "already-open": "もう候補が出ています",
};

/** リファーラル（チャプターのミッション：1週間に1件） */
export interface Referral {
  id: string;
  to: string; // 紹介した相手（メンバー）
  memo?: string;
  createdAt?: Timestamp;
  byName?: string;
}
export const WEEKLY_REFERRAL_GOAL = 1;
export const referralsQuery = () => query(collection(db, "referrals"), orderBy("createdAt", "desc"), limit(60));
export function addReferral(r: { to: string; memo: string; byName: string; byUid: string }) {
  return addDoc(collection(db, "referrals"), { ...r, createdAt: serverTimestamp() });
}
export function deleteReferral(id: string) {
  return deleteDoc(doc(db, "referrals", id));
}
/** 今週・今月の件数（まだ保存中で createdAt が無いものは今として数える） */
export function referralStats(rows: Referral[] | null, now: number, weekStart: number, monthStart: number) {
  const at = (r: Referral) => r.createdAt?.toMillis() ?? now;
  const list = rows ?? [];
  return { week: list.filter((r) => at(r) >= weekStart).length, month: list.filter((r) => at(r) >= monthStart).length };
}

/** 1to1のあとの「ひとことメモ」。memos/{oneToOneId} に1件 */
export const MEMO_TAGS = ["また話したい", "紹介をもらえそう", "こちらから紹介できそう", "お客さんになりそう"] as const;
export interface Memo {
  id: string;
  oneToOneId: string;
  memberId: string;
  memberName: string;
  tags: string[];
  connect: string[];
  text: string;
  byName?: string;
  createdAt?: Timestamp;
}
export const memosQuery = () => query(collection(db, "memos"), orderBy("createdAt", "desc"), limit(100));
export function saveMemo(m: Omit<Memo, "id" | "createdAt">) {
  return setDoc(doc(db, "memos", m.oneToOneId), { ...m, createdAt: serverTimestamp() });
}
/** メモの中身をひとことで（「また話したい・田中さんとつなぐ・…」） */
export function memoSummary(m: Memo) {
  return [...m.tags, ...m.connect.map((n) => `${n}さんとつなぐ`), m.text].filter(Boolean).join("・");
}

/** ホームの「ミッション」「注文・依頼」 */
export type TaskKind = "mission" | "order";
export interface TaskSummary {
  title: string;
  who: string;
  due: string; // YYYY-MM-DD か空
  todo: string[];
  reply: string;
}
export interface Task extends TaskSummary {
  id: string;
  kind: TaskKind;
  raw: string;
  photoCount?: number;
  status: "open" | "done";
  byName?: string;
  createdAt?: Timestamp;
  doneAt?: Timestamp;
}
export const TASK_LABEL: Record<TaskKind, string> = { mission: "ミッション", order: "注文・依頼" };
export const openTasksQuery = () => query(collection(db, "tasks"), where("status", "==", "open"));
export async function addTodo(t: Omit<Task, "id" | "status" | "createdAt" | "doneAt" | "photoCount">, photos: string[] = []) {
  const ref = await addDoc(collection(db, "tasks"), { ...t, photoCount: photos.length, status: "open", createdAt: serverTimestamp() });
  for (const p of photos) await addTaskPhoto(ref.id, p, false);
  return ref;
}
/** 写真は1枚ずつ taskPhotos に（タスク本体を軽くしておくため） */
export interface TaskPhoto {
  id: string;
  taskId: string;
  data: string; // data:image/jpeg;base64,...
  createdAt?: Timestamp;
}
export const taskPhotosQuery = (taskId: string) => query(collection(db, "taskPhotos"), where("taskId", "==", taskId));
export async function addTaskPhoto(taskId: string, data: string, bump = true) {
  await addDoc(collection(db, "taskPhotos"), { taskId, data, createdAt: serverTimestamp() });
  if (bump) await updateDoc(doc(db, "tasks", taskId), { photoCount: increment(1) });
}
export async function deleteTaskPhoto(p: TaskPhoto) {
  await deleteDoc(doc(db, "taskPhotos", p.id));
  await updateDoc(doc(db, "tasks", p.taskId), { photoCount: increment(-1) });
}
export function finishTask(id: string) {
  return updateDoc(doc(db, "tasks", id), { status: "done", doneAt: serverTimestamp() });
}
export function deleteTask(id: string) {
  return deleteDoc(doc(db, "tasks", id));
}
