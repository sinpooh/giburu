import { useMemo, useState } from "react";
import { addDoc, collection, limit, orderBy, query, serverTimestamp, where } from "firebase/firestore";
import { db } from "../firebase";
import { Me, useNow, useQuery, useSettings } from "../lib/hooks";
import { CARD_META, Card, sortCards } from "../lib/cards";
import { OneToOne, activeOneToOnesQuery, addTask, monthStats, openCardsQuery } from "../lib/data";
import { fmtDateTime } from "../lib/time";
import { Character } from "../components/Character";
import { TaskForm } from "../components/TaskForm";
import { usePraise } from "../components/Praise";
import { Home } from "./Home";

const QUICK_PRAISE = ["さすが青山さん！", "いつもありがとう！", "今月いい感じ！", "その調子！応援してます"];

/** シンプーさん用の「見守り」画面 */
export function Watch({ me }: { me: Me }) {
  const now = useNow(30000);
  const settings = useSettings();
  const cards = useQuery<Card>(openCardsQuery());
  const ones = useQuery<OneToOne>(activeOneToOnesQuery());
  const recent = useQuery<Card>(query(collection(db, "cards"), where("status", "==", "done"), orderBy("doneAt", "desc"), limit(10)));
  const [mode, setMode] = useState<"" | "request" | "praise" | "screen">("");
  const { praise } = usePraise();

  const sorted = useMemo(() => sortCards(cards ?? [], now), [cards, now]);
  const top = sorted[0];
  const st = monthStats(ones, now);
  const overdue = (cards ?? []).filter((c) => c.dueAt && c.dueAt.toMillis() < now && (c.type === "request" || c.type === "lineReply" || c.type === "thanks" || c.type === "differentDay"));

  return (
    <div className="page">
      <div className="row gap center-y">
        <Character mood="normal" size={56} />
        <h1>見守り</h1>
      </div>

      <button className="box dashed left-text" onClick={() => setMode("screen")}>
        <div className="muted small">青山さんの今の画面（タップで全体を見る）</div>
        {top ? (
          <b>
            {CARD_META[top.type].label}：{top.title}
          </b>
        ) : (
          <b>今日はもう全部終わり</b>
        )}
        {sorted.length > 1 && <span className="muted small">　ほか{sorted.length - 1}枚</span>}
      </button>

      <div className="stats">
        <Stat n={st.confirmed} label="確定" />
        <Stat n={st.done} label="実施済み" />
        <Stat n={st.waiting} label="返事待ち" />
        <Stat n={`${st.count}/${settings.monthlyGoal}`} label="今月" />
      </div>

      {overdue.map((c) => (
        <div key={c.id} className="alert">
          ⚠ 期限切れ：「{c.title}」（{fmtDateTime(c.dueAt!.toMillis())}まで）
        </div>
      ))}

      <div className="row gap">
        <button className="btn green grow" onClick={() => setMode("request")}>
          ＋ お願い
        </button>
        <button className="btn primary grow" onClick={() => setMode("praise")}>
          👏 褒める
        </button>
      </div>

      <h3>最近の動き</h3>
      <div className="box">
        {(recent ?? []).length === 0 && <p className="muted">まだありません</p>}
        {(recent ?? []).map((c) => (
          <div key={c.id} className="small">
            ✅ {c.doneAt ? fmtDateTime(c.doneAt.toMillis()) : ""} {CARD_META[c.type]?.label}：{c.title}
          </div>
        ))}
      </div>

      {mode === "request" && (
        <TaskForm
          title="青山さんへのお願い"
          placeholder="例：名刺の写真送って"
          withDetail
          onCancel={() => setMode("")}
          onSubmit={async (v) => {
            await addTask({ type: "request", title: v.title, detail: v.detail, dueAt: v.dueAt, byName: me.name, byUid: me.user.uid });
            setMode("");
            praise("お願いを追加しました！次の一服タイムに出ます");
          }}
        />
      )}
      {mode === "praise" && <PraiseForm me={me} onClose={() => setMode("")} />}
      {mode === "screen" && (
        <div className="sheet-bg" onClick={() => setMode("")}>
          <div className="sheet tall" onClick={(e) => e.stopPropagation()}>
            <div className="row between">
              <h2>青山さんの画面</h2>
              <button className="btn ghost small" onClick={() => setMode("")}>
                閉じる
              </button>
            </div>
            <Home me={me} readOnly />
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ n, label }: { n: number | string; label: string }) {
  return (
    <div className="stat">
      <b>{n}</b>
      <span>{label}</span>
    </div>
  );
}

function PraiseForm({ me, onClose }: { me: Me; onClose: () => void }) {
  const [text, setText] = useState("");
  const { praise } = usePraise();
  const send = async (t: string) => {
    await addDoc(collection(db, "praises"), { text: t, byName: me.name, byUid: me.user.uid, seen: false, createdAt: serverTimestamp() });
    onClose();
    praise("褒めを送りました！");
  };
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>青山さんを褒める</h2>
        <div className="chips">
          {QUICK_PRAISE.map((q) => (
            <button key={q} className="chip" onClick={() => send(q)}>
              {q}
            </button>
          ))}
        </div>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="ひとこと（自由に）" />
        <div className="row gap">
          <button className="btn ghost" onClick={onClose}>
            やめる
          </button>
          <button className="btn primary grow" onClick={() => send(text.trim() || "いいね！👏")}>
            送る
          </button>
        </div>
      </div>
    </div>
  );
}
