import { useEffect, useState } from "react";
import { BookingInfo, api } from "../lib/data";
import { Character } from "../components/Character";
import { Confetti } from "../components/Praise";
import { fmtDateTime, fmtRange } from "../lib/time";

function gcalUrl(start: string, end: string, details: string) {
  const f = (s: string) => new Date(s).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const q = new URLSearchParams({ action: "TEMPLATE", text: "青山さんと1to1", dates: `${f(start)}/${f(end)}`, details });
  return `https://calendar.google.com/calendar/render?${q}`;
}

/** 相手用の候補選択ページ（ログイン不要） */
export function Booking({ token }: { token: string }) {
  const [info, setInfo] = useState<BookingInfo | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [step, setStep] = useState<"choose" | "confirm" | "sending" | "done" | "declined">("choose");
  const [err, setErr] = useState("");
  const [result, setResult] = useState<{ start: string; end: string; meetingUrl?: string } | null>(null);

  const load = () =>
    api
      .getBooking({ token })
      .then(setInfo)
      .catch(() => setInfo({ status: "error" }));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (!info) return <Shell>読み込み中…</Shell>;
  if (info.status === "notfound" || info.status === "error" || info.status === "skipped")
    return <Shell>このリンクは見つかりませんでした。お手数ですが青山さんに直接ご連絡ください。</Shell>;
  if (info.status === "expired") return <Shell>このリンクの期限が切れました。青山さんから改めてご連絡します🙏</Shell>;
  if (info.status === "declined") return <Shell>ご連絡ありがとうございます！青山さんから別の候補が届きます。</Shell>;

  const fmt = info.format === "online" ? "オンライン" : "対面（場所はご相談）";
  const header = (
    <div className="row gap center-y">
      <Character mood="normal" size={64} />
      <div>
        <h2 style={{ margin: 0 }}>青山さんとの1to1</h2>
        <div className="muted small">
          {info.durationMin}分・{fmt}
        </div>
      </div>
    </div>
  );

  const confirmed = result ?? (info.status === "confirmed" || info.status === "done" ? info.confirmed : null);
  if (step === "done" || confirmed) {
    const c = confirmed!;
    const details = info.meetingUrl || result?.meetingUrl || "";
    return (
      <div className="booking">
        {step === "done" && <Confetti count={50} />}
        {header}
        <h1 className="pink">確定しました！</h1>
        <p className="big">{fmtRange(Date.parse(c.start), Date.parse(c.end))}</p>
        {details && (
          <p>
            URL：<a href={details}>{details}</a>
          </p>
        )}
        <p className="muted">青山さんのカレンダーにも登録しました。当日よろしくお願いします！</p>
        <a className="btn primary wide" href={gcalUrl(c.start, c.end, details)} target="_blank" rel="noreferrer">
          Googleカレンダーに追加
        </a>
      </div>
    );
  }

  if (info.status !== "waiting" && info.status !== "proposed") return <Shell>このリンクはもう使えません。</Shell>;

  const slots = info.slots ?? [];
  const confirm = async () => {
    if (sel == null) return;
    setStep("sending");
    setErr("");
    try {
      const r = await api.confirmBooking({ token, index: sel });
      if (!r.ok) {
        setErr("ごめんなさい、その枠はちょうど埋まってしまいました。ほかの候補から選んでください。");
        setSel(null);
        setStep("choose");
        load();
        return;
      }
      setResult({ start: r.start!, end: r.end!, meetingUrl: r.meetingUrl });
      setStep("done");
    } catch (e) {
      setErr(String((e as Error).message ?? e));
      setStep("choose");
      load();
    }
  };

  return (
    <div className="booking">
      {header}
      <h1>{info.memberName}さん、都合のいい日を選んでください</h1>
      <p className="muted">選ぶとそのまま確定します</p>
      {err && <p className="notice">{err}</p>}
      {slots.map((s, i) => (
        <button key={s.start} className={`slot-btn ${sel === i ? "on" : ""}`} disabled={s.taken} onClick={() => setSel(i)}>
          <b>{s.label}</b>
          <span className="muted small">{s.taken ? "埋まりました" : s.period}</span>
        </button>
      ))}
      {step === "confirm" ? (
        <div className="box">
          <p>
            <b>{info.memberName}さん</b>として <b>{slots[sel!]?.label}</b> で確定します。よろしいですか？
          </p>
          <div className="row gap">
            <button className="btn ghost" onClick={() => setStep("choose")}>
              戻る
            </button>
            <button className="btn primary grow" onClick={confirm}>
              確定する
            </button>
          </div>
        </div>
      ) : (
        <button className="btn primary wide" disabled={sel == null || step === "sending"} onClick={() => setStep("confirm")}>
          {step === "sending" ? "確定しています…" : "この日で確定する"}
        </button>
      )}
      <button
        className="link-btn center wide"
        onClick={async () => {
          if (!confirm_("どの日も合わない場合、青山さんに別の候補をお願いします。よろしいですか？")) return;
          try {
            await api.declineBooking({ token });
            setInfo({ ...info, status: "declined" });
          } catch (e) {
            setErr(String((e as Error).message ?? e));
          }
        }}
      >
        どれも合わない（別の日を頼む）
      </button>
      {info.expiresAt && <p className="muted small center">このリンクは {fmtDateTime(info.expiresAt)} まで有効です</p>}
    </div>
  );
}

const confirm_ = (m: string) => window.confirm(m);

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="booking center">
      <Character mood="praise" size={160} say="ありがとうございます！" />
      <p>{children}</p>
    </div>
  );
}
