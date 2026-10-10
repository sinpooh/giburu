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

/** AIを使わずに、貼り付けた文から「やること・相手・期限」をざっくり取り出す */
export function localSummary(raw: string, memberNames: string[], now: number) {
  const g = guessFromLine(raw, memberNames);
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.replace(/^(?:午前|午後)?\d{1,2}:\d{2}\s+\S+\s+/, "").trim())
    .filter((l) => l && !/^\d{4}[./]\d{1,2}[./]\d{1,2}/.test(l));
  const title = (lines[0] ?? "").slice(0, 40);
  const day = (n: number) => {
    const d = new Date(now + n * 86400000 + 9 * 3600000);
    return d.toISOString().slice(0, 10);
  };
  let due = "";
  const md = raw.match(/(\d{1,2})[/月](\d{1,2})日?/);
  const wd = raw.match(/([日月火水木金土])曜/);
  if (/(今日|本日|至急|急ぎ)/.test(raw)) due = day(0);
  else if (/(明日|あした)/.test(raw)) due = day(1);
  else if (/明後日|あさって/.test(raw)) due = day(2);
  else if (md) {
    const y = Number(day(0).slice(0, 4));
    const cand = `${y}-${md[1].padStart(2, "0")}-${md[2].padStart(2, "0")}`;
    due = cand < day(0) ? `${y + 1}${cand.slice(4)}` : cand;
  } else if (wd) {
    const target = "日月火水木金土".indexOf(wd[1]);
    const today = new Date(now + 9 * 3600000).getUTCDay();
    due = day((target - today + 7) % 7 || 7);
  }
  return { title, who: g.name, due, todo: [] as string[], reply: "" };
}
