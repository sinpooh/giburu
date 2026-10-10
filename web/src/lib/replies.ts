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

/**
 * LINEからコピーしたメッセージを読んで、だれから・何て返すか・いつまでに を推測する。
 * 複数行コピー（「10:30 山田太郎 本文」の形）なら名前が取れる。1件だけのコピーは本文のみ。
 */
export function guessFromLine(raw: string, memberNames: string[]) {
  const text = raw.trim();
  let name = "";
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^(?:午前|午後)?\d{1,2}:\d{2}\s+(\S+)\s+\S/);
    if (m) name = m[1];
  }
  if (name) name = memberNames.find((n) => name.startsWith(n) || n.startsWith(name)) ?? name;
  else name = memberNames.find((n) => n.length >= 2 && text.includes(n)) ?? "";
  let kind: ReplyKind = "ok";
  if (/(いかが|どう(です|でしょう)|可能|できますか|空いて|ご都合|\?|？)/.test(text)) kind = /(日|時|曜)/.test(text) ? "dateOk" : "wait";
  else if (/(ありがと|感謝|助かり)/.test(text)) kind = "thanks";
  const due: "today" | "tomorrow" | "week" = /(至急|急ぎ|今日|本日|すぐ)/.test(text) ? "today" : /(明日|あした)/.test(text) ? "today" : /(今週|来週|週末)/.test(text) ? "tomorrow" : "tomorrow";
  return { name: name.replace(/さん$/, ""), kind, due };
}
