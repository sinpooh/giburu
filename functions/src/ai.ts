import { AnthropicVertex } from "@anthropic-ai/vertex-sdk";

// Google Cloud（Vertex AI）経由でClaudeを呼ぶ。鍵は不要で、関数のサービスアカウントの権限で動く。
// 料金はFirebaseと同じGoogleの請求にまとまる（予算アラートの対象）。
const MODEL = "claude-opus-5-5";
let client: AnthropicVertex | null = null;
const ai = () => (client ??= new AnthropicVertex({ projectId: process.env.GCLOUD_PROJECT ?? "giburu-178f1", region: "global" }));

export type TaskKind = "mission" | "order";

export interface TaskSummary {
  title: string; // 一行で（20字くらい）
  who: string; // 相手の名前（わからなければ空）
  due: string; // YYYY-MM-DD（わからなければ空）
  todo: string[]; // やることを短く1〜3個
  reply: string; // 相手に送るLINEの返信文（不要なら空）
}

const SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    who: { type: "string" },
    due: { type: "string" },
    todo: { type: "array", items: { type: "string" } },
    reply: { type: "string" },
  },
  required: ["title", "who", "due", "todo", "reply"],
  additionalProperties: false,
} as const;

const SYSTEM = `あなたはリサイクルショップで働く青山さんの手伝い役です。青山さんは予定やタスクの管理が苦手で、LINEが1日に100件以上来ます。
渡された文章（LINEを貼り付けたもの、または手打ちのメモ）を読み、青山さんが「何を・だれに・いつまでに」やればいいかが一目でわかるようにまとめてください。
- title: やることを20字くらいで。「〇〇さんの△△」のように具体的に
- who: 依頼してきた人や相手の名前（さん付けなし）。わからなければ空
- due: 期限を YYYY-MM-DD で。「明日」「金曜」などは今日の日付から計算。書かれていなければ空
- todo: 青山さんが実際にやる動作を短く1〜3個（例：「在庫を確認する」「写真を送る」）
- reply: 相手に返事が必要なら、青山さんとして送るやわらかい丁寧なLINEの返信文（2〜3行、絵文字1つまで）。返事が不要なら空
書かれていないことは作らないでください。`;

export async function summarizeTask(text: string, kind: TaskKind, today: string): Promise<TaskSummary> {
  const res = await ai().messages.create({
    model: MODEL,
    max_tokens: 4000,
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `今日は ${today} です。種類：${kind === "mission" ? "ミッション（BNIや役割で頼まれた・決めたやること）" : "注文・依頼（お客さんや知り合いからの注文や頼まれごと）"}\n\n<text>\n${text.slice(0, 6000)}\n</text>`,
      },
    ],
  });
  if (res.stop_reason === "refusal") throw new Error("refusal");
  const block = res.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("no text");
  const out = JSON.parse(block.text) as TaskSummary;
  return {
    title: String(out.title ?? "").slice(0, 60),
    who: String(out.who ?? "").replace(/さん$/, "").slice(0, 30),
    due: /^\d{4}-\d{2}-\d{2}$/.test(out.due ?? "") ? out.due : "",
    todo: (out.todo ?? []).map(String).filter(Boolean).slice(0, 3),
    reply: String(out.reply ?? "").slice(0, 400),
  };
}
