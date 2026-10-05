import { useEffect, useMemo, useState } from "react";
import { collection, doc, query, updateDoc, where } from "firebase/firestore";
import { db } from "../firebase";
import { Me, isIOS, isStandalone, useDoc, useNow, useQuery, useSettings } from "../lib/hooks";
import { CARD_META, Card, sortCards } from "../lib/cards";
import { OneToOne, REASONS, activeOneToOnesQuery, addLineReply, api, finishCard, monthStats, openCardsQuery, snoozeCard } from "../lib/data";
import { fmtCountdown, jst, nextSmokeTime } from "../lib/time";
import { Bubble, Character, Mood } from "../components/Character";
import { Meter } from "../components/Meter";
import { SwipeCard } from "../components/SwipeCard";
import { Confetti, usePraise } from "../components/Praise";
import { LineReplyForm } from "../components/LineReplyForm";
import { lineUrlFor } from "../lib/replies";
import { pushState } from "../lib/push";

function greeting(now: number, smokeTimes: string[]): string {
  const p = jst(now);
  const cur = p.hh * 60 + p.mm;
  const smoke = smokeTimes.some((t) => {
    const [h, m] = t.split(":").map(Number);
    const at = h * 60 + m;
    return cur >= at && cur < at + 30;
  });
  if (smoke) return "一服タイムっすね！今日はこの1枚だけでOK👍";
  if (p.hh < 11) return "おはようございます！今日も1枚だけいきましょ";
  if (p.hh < 17) return "お疲れさまです！スワイプ1回で終わるやつです";
  return "今日もお疲れさまでした！あと1枚だけ見てって〜";
}

export function Home({ me, readOnly = false, goSchedule, goSettings }: { me: Me; readOnly?: boolean; goSchedule?: () => void; goSettings?: () => void }) {
  const now = useNow(30000);
  const settings = useSettings();
  const cards = useQuery<Card>(openCardsQuery());
  const ones = useQuery<OneToOne>(activeOneToOnesQuery());
  const calendar = useDoc<{ connected?: boolean }>(doc(db, "settings", "calendar"));
  const praises = useQuery<{ id: string; text: string; byName: string }>(readOnly ? null : query(collection(db, "praises"), where("seen", "==", false)));
  const { praise, celebrate } = usePraise();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [adding, setAdding] = useState(false);
  const [loadingNew, setLoadingNew] = useState(false);

  const sorted = useMemo(() => sortCards(cards ?? [], now), [cards, now]);
  const top = sorted[0];
  const stats = monthStats(ones, now);
  // 渡辺さん（viewer）も青山さんと同じ操作ができる。褒めの表示だけは青山さん本人に出す
  const isAoyama = (me.role === "aoyama" || me.role === "viewer") && !readOnly;

  // シンプーさんからの「褒める」を表示
  useEffect(() => {
    if (!isAoyama || me.role !== "aoyama" || !praises || praises.length === 0) return;
    const p = praises[0];
    celebrate({ title: `${p.byName}さんから👏`, sub: p.text });
    updateDoc(doc(db, "praises", p.id), { seen: true }).catch(console.error);
  }, [praises, isAoyama, me.role, celebrate]);

  useEffect(() => setOpen(false), [top?.id]);

  const snoozeTarget = () => nextSmokeTime(Date.now(), settings.smokeTimes, settings.weekendNotify);

  const openLine = (url?: string) => {
    if (url) window.open(url, "_blank");
  };

  const onRight = (c: Card) => {
    switch (c.type) {
      case "proposal":
      case "noReply":
      case "differentDay":
        openLine(c.lineUrl);
        api.markSent({ cardId: c.id }).catch((e) => setMsg(String(e.message ?? e)));
        praise();
        break;
      case "thanks":
        openLine(c.lineUrl);
        finishCard(c.id);
        praise();
        break;
      case "lineReply":
        openLine(c.lineUrl ?? lineUrlFor(c.lineText ?? ""));
        finishCard(c.id);
        praise();
        break;
      case "confirmed":
        finishCard(c.id);
        if (c.milestone) celebrate({ title: `今月${settings.monthlyGoal}件達成！！`, sub: "青山さん、最高すぎる！店長も鼻が高いっす！" });
        else praise("1to1、決まりましたね！さすが！");
        break;
      default:
        finishCard(c.id);
        praise();
    }
  };

  const onLeft = async (c: Card) => {
    switch (c.type) {
      case "proposal":
      case "noReply":
        try {
          const r = await api.skipProposal({ cardId: c.id });
          if (r.reason) setMsg(REASONS[r.reason] ?? r.reason);
        } catch (e) {
          setMsg(String((e as Error).message ?? e));
        }
        break;
      case "confirmed":
        finishCard(c.id);
        break;
      case "tomorrow":
        await finishCard(c.id);
        goSchedule?.();
        break;
      default:
        snoozeCard(c.id, snoozeTarget());
    }
  };

  const newProposal = async () => {
    setLoadingNew(true);
    setMsg("");
    try {
      const r = await api.requestProposal();
      if (r.reason) setMsg(REASONS[r.reason] ?? r.reason);
    } catch (e) {
      setMsg(String((e as Error).message ?? e));
    } finally {
      setLoadingNew(false);
    }
  };

  const setupTodo: { text: string; action?: () => void }[] = [];
  if (isAoyama) {
    if (isIOS() && !isStandalone()) setupTodo.push({ text: "Safariの共有ボタン →「ホーム画面に追加」をしてね（通知に必要）" });
    if (me.role === "aoyama" && calendar && !calendar.connected) setupTodo.push({ text: "Googleカレンダーをつなぐ", action: goSettings });
    if (isStandalone() && pushState() === "default") setupTodo.push({ text: "通知をONにする", action: goSettings });
  }

  let mood: Mood = "normal";
  const dueMs = top?.dueAt?.toMillis();
  if (dueMs && dueMs - now < 24 * 3600000) mood = "nudge";

  return (
    <div className="page">
      {!readOnly && <Bubble mood={mood}>{top ? greeting(now, settings.smokeTimes) : "今日はもう全部終わり！最高！🎉"}</Bubble>}

      {setupTodo.length > 0 && (
        <div className="setup">
          <div className="setup-title">はじめの準備</div>
          {setupTodo.map((t) => (
            <button key={t.text} className="setup-item" onClick={t.action} disabled={!t.action}>
              ☐ {t.text}
            </button>
          ))}
        </div>
      )}

      <Meter count={stats.count} goal={settings.monthlyGoal} />

      {cards === null ? (
        <div className="card muted center">読み込み中…</div>
      ) : top ? (
        <SwipeCard
          key={top.id}
          rightLabel={CARD_META[top.type].right}
          leftLabel={CARD_META[top.type].left}
          onRight={() => onRight(top)}
          onLeft={() => onLeft(top)}
          readOnly={readOnly}
          tone={top.type === "confirmed" ? "party" : "normal"}
        >
          {top.type === "confirmed" && <Confetti count={24} />}
          <CardBody card={top} now={now} open={open} onToggle={() => setOpen(!open)} />
        </SwipeCard>
      ) : (
        <div className="card center empty">
          <Character mood="praise" size={130} />
          <p>
            <b>今日はもう全部終わり！</b>
          </p>
          {!readOnly && (
            <button className="btn primary" onClick={newProposal} disabled={loadingNew}>
              {loadingNew ? "探しています…" : "1to1の候補を出す"}
            </button>
          )}
        </div>
      )}

      {sorted.length > 1 && <p className="center muted small">あと{sorted.length - 1}枚</p>}
      {msg && <p className="center notice">{msg}</p>}

      {isAoyama && (
        <button className="btn ghost wide" onClick={() => setAdding(true)}>
          ＋ LINE返信あとで
        </button>
      )}
      {adding && (
        <LineReplyForm
          onCancel={() => setAdding(false)}
          onSubmit={async (v) => {
            await addLineReply({ ...v, byName: me.name, byUid: me.user.uid });
            setAdding(false);
            praise("覚えときます！あとは任せて");
          }}
        />
      )}
    </div>
  );
}

function CardBody({ card, now, open, onToggle }: { card: Card; now: number; open: boolean; onToggle: () => void }) {
  const meta = CARD_META[card.type];
  const due = card.dueAt?.toMillis();
  const left = due ? due - now : null;
  const [copied, setCopied] = useState(false);
  open = open || card.type === "lineReply"; // LINE返信は文面を最初から見せる
  return (
    <div className="card-body" onClick={onToggle}>
      <div className="row between">
        <span className={`tag tag-${card.type}`}>{meta.label}</span>
        {left !== null && left < 24 * 3600000 && left > 0 && <span className="countdown mono">あと {fmtCountdown(left)}</span>}
        {left !== null && left >= 24 * 3600000 && <span className="tag">期限 {new Date(due!).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", timeZone: "Asia/Tokyo" })}</span>}
      </div>
      <h2 className="card-title">{card.title}</h2>
      {card.sub && <p className="muted">{card.sub}</p>}
      {card.hint && <p className="hint">💡 {card.hint}</p>}
      {card.createdByName && card.type !== "lineReply" && <p className="muted small">{card.createdByName}さんから</p>}
      {card.slots && (
        <div className="slots">
          {card.slots.map((s) => (
            <div key={s.start} className="slot">
              <b>{s.label}</b>
              <span className="muted small">{s.period}</span>
            </div>
          ))}
        </div>
      )}
      {card.calendarChecked === false && <p className="notice small">※カレンダー未連携のため、予定の確認はしていません</p>}
      {card.type === "confirmed" && <p className="center big-pink">今月 {card.monthCount}件目！</p>}
      {open && (card.detail || card.lineText) && (
        <div className="detail" onClick={(e) => e.stopPropagation()}>
          {card.detail && <p>{card.detail}</p>}
          {card.lineText && (
            <>
              <pre className="line-text">{card.lineText}</pre>
              <button
                className="btn ghost small"
                onClick={async () => {
                  await navigator.clipboard.writeText(card.lineText!);
                  setCopied(true);
                }}
              >
                {copied ? "コピーしました" : "文面をコピー"}
              </button>
            </>
          )}
        </div>
      )}
      {(card.detail || card.lineText) && !open && <p className="muted small center">タップで中身を見る</p>}
    </div>
  );
}
