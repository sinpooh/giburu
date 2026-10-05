import { Timestamp } from "firebase/firestore";
import { DAY, startOfDay } from "./time";

export type CardType = "proposal" | "noReply" | "differentDay" | "confirmed" | "tomorrow" | "thanks" | "request" | "lineReply";

export interface Card {
  id: string;
  type: CardType;
  status: "open" | "done" | "dismissed";
  title: string;
  sub?: string;
  hint?: string;
  detail?: string;
  slots?: { start: string; end: string; label: string; period: string }[];
  oneToOneId?: string;
  memberId?: string;
  lineText?: string;
  lineUrl?: string;
  calendarChecked?: boolean;
  dueAt?: Timestamp | null;
  snoozedUntil?: Timestamp | null;
  createdAt?: Timestamp | null;
  doneAt?: Timestamp | null;
  createdByName?: string;
  monthCount?: number;
  milestone?: boolean;
}

const WAITING_OTHERS = ["differentDay", "thanks", "noReply", "confirmed", "tomorrow"];
const ms = (t?: Timestamp | null) => (t ? t.toMillis() : null);

/** ホームに出す順番。functions/src/logic.ts の sortCards と同じルール */
export function sortCards(cards: Card[], now: number): Card[] {
  const endToday = startOfDay(now) + DAY;
  const rank = (c: Card) => {
    const due = ms(c.dueAt);
    if (due && due < endToday) return 0;
    if (WAITING_OTHERS.includes(c.type)) return 1;
    if (c.type === "request" || c.type === "lineReply") return 2;
    return 3;
  };
  return cards
    .filter((c) => c.status === "open" && (!c.snoozedUntil || c.snoozedUntil.toMillis() <= now))
    .sort((a, b) => rank(a) - rank(b) || (ms(a.dueAt) ?? Infinity) - (ms(b.dueAt) ?? Infinity) || (ms(a.createdAt) ?? 0) - (ms(b.createdAt) ?? 0));
}

/** カードの種類ごとのラベルとスワイプの意味 */
export const CARD_META: Record<CardType, { label: string; right: string; left: string }> = {
  proposal: { label: "1to1のおすすめ", right: "LINEで送る", left: "別の人" },
  noReply: { label: "返事がまだ", right: "もう一回送る", left: "別の人にする" },
  differentDay: { label: "別の日がいい", right: "新しい3枠で送る", left: "あとで" },
  confirmed: { label: "決まった！", right: "見た", left: "見た" },
  tomorrow: { label: "明日の1to1", right: "OK", left: "予定を見る" },
  thanks: { label: "お礼", right: "LINEでお礼", left: "あとで" },
  request: { label: "シンプーさんからのお願い", right: "完了", left: "あとで" },
  lineReply: { label: "LINE返信", right: "LINEで返信", left: "あとで" },
};
