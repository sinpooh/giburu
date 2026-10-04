import { addDoc, collection, doc, query, serverTimestamp, Timestamp, updateDoc, where } from "firebase/firestore";
import { call, db } from "../firebase";
import { startOfMonth, startOfNextMonth } from "./time";

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
  confirmBooking: call<{ token: string; index: number }, { ok: boolean; reason?: string; start?: string; end?: string; meetingUrl?: string }>("confirmBooking"),
  declineBooking: call<{ token: string }, { ok: boolean }>("declineBooking"),
};

export interface BookingInfo {
  status: string;
  memberName?: string;
  format?: "online" | "inperson";
  durationMin?: number;
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

export const REASONS: Record<string, string> = {
  "no-members": "メンバーがまだ登録されていません。メンバー画面から追加してね",
  "no-candidates": "今日誘える人はもういません。また明日！",
  "no-slots": "2週間先まで空きが見つかりませんでした",
  "already-open": "もう候補が出ています",
};
