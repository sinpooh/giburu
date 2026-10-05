// LINE返信の下書き（店長キャラが文面を用意する）
export const REPLY_KINDS = [
  {
    key: "ok",
    label: "了解です",
    text: "{name}さん、ご連絡ありがとうございます！\n承知しました🙆\nよろしくお願いします！",
  },
  {
    key: "thanks",
    label: "ありがとう",
    text: "{name}さん、ありがとうございます！\nとても助かりました🙏\nまたよろしくお願いします！",
  },
  {
    key: "dateOk",
    label: "その日でOK",
    text: "{name}さん、ご連絡ありがとうございます！\nその日程で大丈夫です😊\n当日よろしくお願いします！",
  },
  {
    key: "wait",
    label: "少し待って",
    text: "{name}さん、ご連絡ありがとうございます！\n確認して改めてお返事しますので、少しだけお待ちください🙏",
  },
  {
    key: "decline",
    label: "今回はごめん",
    text: "{name}さん、お声がけありがとうございます！\nあいにく今回は都合がつかず…ごめんなさい🙏\nまた機会があればぜひよろしくお願いします！",
  },
  { key: "free", label: "自分で書く", text: "" },
] as const;

export type ReplyKind = (typeof REPLY_KINDS)[number]["key"];

export function replyDraft(kind: ReplyKind, name: string): string {
  const k = REPLY_KINDS.find((r) => r.key === kind);
  return (k?.text ?? "").replace(/\{name\}/g, name.replace(/さん$/, "") || "〇〇");
}

/** 文面つきでLINEを開く（相手はLINE側で選ぶ）。文面なしならトーク一覧を開く */
export function lineUrlFor(text: string): string {
  return text.trim() ? `https://line.me/R/share?text=${encodeURIComponent(text)}` : "https://line.me/R/nv/chat";
}
