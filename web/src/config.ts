// ログイン許可リスト。firestore.rules と functions/src/config.ts と同じ内容にしておくこと。
export type Role = "aoyama" | "manager" | "viewer"; // viewer = 青山さんと同じ画面・同じ操作・同じ通知（渡辺さん）

export const ALLOWED: Record<string, { role: Role; name: string; notifyManager: boolean }> = {
  "sinpooh@urukau-ichioshi.com": { role: "manager", name: "シンプー", notifyManager: true },
  "omochi.mochi0567@gmail.com": { role: "aoyama", name: "青山", notifyManager: false },
  "sinpooh.recycle@gmail.com": { role: "viewer", name: "渡辺", notifyManager: false },
};

export const AOYAMA_EMAIL = Object.keys(ALLOWED).find((k) => ALLOWED[k].role === "aoyama")!;

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

// 画面で使う既定値（サーバ側の既定値は functions/src/config.ts）
export const DEFAULTS: Pick<AppSettings, "workStart" | "workEnd" | "durationMin" | "bufferMin" | "format" | "meetingUrl" | "monthlyGoal" | "smokeTimes" | "weekendNotify" | "includeWeekends"> = {
  workStart: "10:00",
  workEnd: "18:00",
  durationMin: 60,
  bufferMin: 30,
  format: "online",
  meetingUrl: "",
  monthlyGoal: 6,
  smokeTimes: ["10:30", "15:00", "19:30"],
  weekendNotify: false,
  includeWeekends: false,
};
