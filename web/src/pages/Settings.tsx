import { useEffect, useState } from "react";
import { doc, setDoc, updateDoc } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { auth, db } from "../firebase";
import { Me, isIOS, isStandalone, useDoc, useSettings } from "../lib/hooks";
import { api } from "../lib/data";
import { enablePush, pushState } from "../lib/push";
import { AOYAMA_EMAIL, AppSettings } from "../config";
import { Character } from "../components/Character";

const CAL_MSG: Record<string, string> = {
  ok: "カレンダーをつなぎました！🎉",
  "other-account": `つなぎました。ただし青山さんのアカウント（${AOYAMA_EMAIL}）ではないようです`,
  error: "うまくつなげませんでした。もう一度お試しください",
  cancel: "キャンセルしました",
};

export function Settings({ me, calendarResult }: { me: Me; calendarResult?: string }) {
  const s = useSettings();
  const cal = useDoc<{ connected?: boolean; email?: string }>(doc(db, "settings", "calendar"));
  const myUser = useDoc<{ notifyManager?: boolean; fcmTokens?: string[] }>(doc(db, "users", me.user.uid));
  const [msg, setMsg] = useState(calendarResult ? CAL_MSG[calendarResult] ?? "" : "");
  const [busy, setBusy] = useState(false);
  const [perm, setPerm] = useState(pushState());

  const save = (patch: Partial<AppSettings>) => setDoc(doc(db, "settings", "app"), patch, { merge: true });

  const connectCalendar = async () => {
    setBusy(true);
    try {
      const { url } = await api.calendarAuthUrl();
      location.href = url;
    } catch (e) {
      setMsg(`エラー：${(e as Error).message}`);
      setBusy(false);
    }
  };

  const turnOnPush = async () => {
    setBusy(true);
    try {
      const ok = await enablePush(me.user.uid);
      setPerm(pushState());
      setMsg(ok ? "通知をONにしました" : "通知を許可できませんでした（iPhoneの設定 > 通知 > ギブる を確認）");
    } catch (e) {
      setMsg(`エラー：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <h1>設定</h1>
      {msg && <p className="notice">{msg}</p>}

      <section className="box">
        <h3>Googleカレンダー</h3>
        {cal?.connected ? (
          <p>✅ つながっています{cal.email ? `（${cal.email}）` : ""}</p>
        ) : (
          <p className="muted">まだつながっていません。青山さんのGoogleアカウントで許可してください。</p>
        )}
        {/* 別のアカウントでつなぎ直すと青山さんの予定が見えなくなるので、渡辺さんにはボタンを出さない */}
        {me.role !== "viewer" && (
          <button className="btn primary" disabled={busy} onClick={connectCalendar}>
            {cal?.connected ? "つなぎ直す" : "カレンダーをつなぐ"}
          </button>
        )}
        {me.role !== "viewer" && !cal?.connected && <p className="muted small">「このアプリは Google で確認されていません」と出たら「詳細」→「ギブる（安全ではないページ）に移動」で進んでOKです（ギブるは青山さん専用なので審査を受けていないだけです）。</p>}
      </section>

      <section className="box">
        <h3>通知</h3>
        {isIOS() && !isStandalone() ? (
          <p className="muted">iPhoneでは「ホーム画面に追加」したアプリから開いたときだけ通知をONにできます。</p>
        ) : perm === "unsupported" ? (
          <p className="muted">この端末・ブラウザは通知に対応していません。</p>
        ) : perm === "denied" ? (
          <p className="muted">通知がブロックされています。端末の設定から「ギブる」の通知を許可してください。</p>
        ) : (
          <div className="row gap">
            <button className="btn primary" disabled={busy} onClick={turnOnPush}>
              {perm === "granted" ? "通知を登録し直す" : "通知をONにする"}
            </button>
            {perm === "granted" && (
              <button
                className="btn ghost"
                onClick={async () => {
                  const r = await api.sendTestPush();
                  setMsg(r.sent ? "テスト通知を送りました" : "送り先が見つかりませんでした。「通知を登録し直す」を押してください");
                }}
              >
                テスト通知
              </button>
            )}
          </div>
        )}
        {me.role === "manager" && myUser && (
          <label className="check">
            <input type="checkbox" checked={!!myUser.notifyManager} onChange={(e) => updateDoc(doc(db, "users", me.user.uid), { notifyManager: e.target.checked })} />
            期限切れ・1to1確定の通知を受け取る
          </label>
        )}
      </section>

      <section className="box">
        <h3>一服タイム（この時刻にカードを1枚だけ通知）</h3>
        <SmokeTimes value={s.smokeTimes} onChange={(v) => save({ smokeTimes: v })} />
        <label className="check">
          <input type="checkbox" checked={s.weekendNotify} onChange={(e) => save({ weekendNotify: e.target.checked })} />
          土日も通知する
        </label>
      </section>

      <section className="box">
        <h3>1to1の候補の出し方</h3>
        <div className="grid2">
          <Field label="開始" type="time" value={s.workStart} onSave={(v) => save({ workStart: v })} />
          <Field label="終了" type="time" value={s.workEnd} onSave={(v) => save({ workEnd: v })} />
          <Field label="相手に見せる長さ（分）" type="number" value={String(s.durationMin)} onSave={(v) => save({ durationMin: Number(v) || 60 })} />
          <Field label="前後の余白（分）" type="number" value={String(s.bufferMin)} onSave={(v) => save({ bufferMin: Number(v) || 0 })} />
          <Field label="今月の目標（件）" type="number" value={String(s.monthlyGoal)} onSave={(v) => save({ monthlyGoal: Number(v) || 6 })} />
        </div>
        <label className="check">
          <input type="checkbox" checked={s.includeWeekends} onChange={(e) => save({ includeWeekends: e.target.checked })} />
          土日も候補に入れる
        </label>
        <div className="small muted">お休みの曜日（候補に出しません）</div>
        <div className="chips">
          {["日", "月", "火", "水", "木", "金", "土"].map((w, i) => {
            const closed = (s.closedDays ?? []).includes(i);
            return (
              <button
                key={w}
                className={`chip ${closed ? "on" : ""}`}
                onClick={() => save({ closedDays: closed ? s.closedDays.filter((d) => d !== i) : [...(s.closedDays ?? []), i] })}
              >
                {w}
              </button>
            );
          })}
        </div>
        <div className="small muted">相手は「来店（おすすめ）・Zoom・訪問」から選べます</div>
        <Field label="来店のときのお店の住所" type="text" value={s.shopAddress ?? ""} onSave={(v) => save({ shopAddress: v })} />
        <Field label="ZoomのURL（いつも同じもの）" type="url" value={s.meetingUrl} onSave={(v) => save({ meetingUrl: v })} />
        <div className="grid2">
          <Field label="カレンダーで確保する長さ（分）" type="number" value={String(s.holdMin ?? 90)} onSave={(v) => save({ holdMin: Number(v) || 90 })} />
          <Field label="訪問の移動時間（片道・分）" type="number" value={String(s.visitTravelMin ?? 45)} onSave={(v) => save({ visitTravelMin: Number(v) || 0 })} />
        </div>
      </section>

      {me.role === "manager" && <Templates s={s} save={save} />}

      <section className="box center">
        <Character mood="guide" size={70} say="設定はいつでも変えられるよ！" />
        <p className="muted small">{me.user.email} でログイン中</p>
        <button className="btn ghost" onClick={() => signOut(auth)}>
          ログアウト
        </button>
      </section>
    </div>
  );
}

function Field({ label, type, value, onSave }: { label: string; type: string; value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <label className="field">
      <span>{label}</span>
      <input type={type} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onSave(v)} />
    </label>
  );
}

function SmokeTimes({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="chips">
      {value.map((t, i) => (
        <span key={i} className="time-chip">
          <input
            type="time"
            value={t}
            onChange={(e) => {
              const next = [...value];
              next[i] = e.target.value;
              onChange(next.filter(Boolean));
            }}
          />
          <button className="x" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="削除">
            ×
          </button>
        </span>
      ))}
      <button className="chip" onClick={() => onChange([...value, "12:00"])}>
        ＋追加
      </button>
    </div>
  );
}

function Templates({ s, save }: { s: AppSettings; save: (p: Partial<AppSettings>) => void }) {
  const [t, setT] = useState<string>("");
  const joined = (s.templates ?? []).join("\n---\n");
  useEffect(() => setT(joined), [joined]);
  return (
    <section className="box">
      <h3>LINEの文面（店長だけ）</h3>
      <p className="muted small">{"{name}=相手の名前、{url}=候補選択ページ、{slots}=候補の日時。誘い文は「---」だけの行で区切ると毎回ランダムで使います。"}</p>
      <textarea rows={10} value={t} placeholder="空欄なら最初から入っている文面を使います" onChange={(e) => setT(e.target.value)} onBlur={() => t !== joined && save({ templates: t.split(/\n-{3,}\n/).map((x) => x.trim()).filter(Boolean) })} />
      <TemplateField label="返事がない時の再送" value={s.resendTemplate} onSave={(v) => save({ resendTemplate: v })} />
      <TemplateField label="「別の日がいい」と言われた時" value={s.differentDayTemplate} onSave={(v) => save({ differentDayTemplate: v })} />
      <TemplateField label="お礼" value={s.thanksTemplate} onSave={(v) => save({ thanksTemplate: v })} />
    </section>
  );
}

function TemplateField({ label, value, onSave }: { label: string; value?: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value ?? "");
  useEffect(() => setV(value ?? ""), [value]);
  return (
    <label className="field">
      <span>{label}</span>
      <textarea rows={4} value={v} placeholder="空欄なら最初から入っている文面を使います" onChange={(e) => setV(e.target.value)} onBlur={() => v !== (value ?? "") && onSave(v)} />
    </label>
  );
}
