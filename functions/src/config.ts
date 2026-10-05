// ログイン許可リスト。firestore.rules と web/src/config.ts と同じ内容にしておくこと。
export type Role = "aoyama" | "manager" | "viewer"; // viewer = 青山さんと同じ画面・同じ操作・同じ通知（渡辺さん）

export const ALLOWED: Record<string, { role: Role; name: string; notifyManager: boolean }> = {
  "sinpooh@urukau-ichioshi.com": { role: "manager", name: "シンプー", notifyManager: true },
  "omochi.mochi0567@gmail.com": { role: "aoyama", name: "青山", notifyManager: false },
  "sinpooh.recycle@gmail.com": { role: "viewer", name: "渡辺", notifyManager: false },
};

export const REGION = "asia-northeast1";

export function appUrl(): string {
  return process.env.APP_URL || "https://giburu-178f1.web.app";
}

export interface AppSettings {
  workStart: string;
  workEnd: string;
  durationMin: number;
  bufferMin: number;
  rangeStartDays: number;
  rangeEndDays: number;
  includeWeekends: boolean;
  format: "online" | "inperson";
  meetingUrl: string;
  monthlyGoal: number;
  maxWaiting: number;
  smokeTimes: string[];
  weekendNotify: boolean;
  templates: string[];
  thanksTemplate: string;
  differentDayTemplate: string;
  resendTemplate: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  workStart: "10:00",
  workEnd: "18:00",
  durationMin: 60,
  bufferMin: 30,
  rangeStartDays: 3,
  rangeEndDays: 14,
  includeWeekends: false,
  format: "online",
  meetingUrl: "",
  monthlyGoal: 6,
  maxWaiting: 2,
  smokeTimes: ["10:30", "15:00", "19:30"],
  weekendNotify: false,
  templates: [
    "{name}さん、お疲れさまです！青山です。\nよかったら1to1しませんか？\n都合のいい日をこちらから選んでもらえると嬉しいです👇\n{url}\n（{slots} の中から選べます）",
    "{name}さん、こんにちは！青山です。\n最近ゆっくり話せてないので、1to1お願いできませんか？\n下のリンクから日にちを選ぶだけで決まります🙌\n{url}\n候補：{slots}",
    "{name}さん、お疲れさまです！\nぜひ一度1to1させてください！\nご都合いい枠をポチッと選んでもらえたら助かります😊\n{url}\n（{slots}）",
  ],
  resendTemplate:
    "{name}さん、お疲れさまです！青山です。\n先日の1to1のお誘い、もし見逃していたら改めて候補を出しました🙏\n{url}\n（{slots}）\nもちろん無理なさらずで大丈夫です！",
  differentDayTemplate:
    "{name}さん、ご連絡ありがとうございます！\n別の候補を出してみました🙏\n{url}\n（{slots}）\nこの中にいい日があれば選んでください！",
  thanksTemplate:
    "{name}さん、今日は1to1ありがとうございました！\nお話できてとても楽しかったです。\nまたよろしくお願いします🙌",
};
