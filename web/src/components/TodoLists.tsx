import { useState } from "react";
import { TASK_LABEL, Task, TaskKind, TaskPhoto, addTaskPhoto, deleteTaskPhoto, finishTask, taskPhotosQuery } from "../lib/data";
import { useQuery } from "../lib/hooks";
import { shrinkImage } from "../lib/image";
import { lineUrlFor } from "../lib/replies";

const dueLabel = (due: string, today: string, tomorrow: string) =>
  !due ? "" : due < today ? "期限すぎ" : due === today ? "今日まで" : due === tomorrow ? "明日まで" : `${Number(due.slice(5, 7))}/${Number(due.slice(8, 10))}まで`;

/** ホームの「🎯 ミッション」「📦 注文・依頼」。期限の近い順。✓で完了 */
export function TodoLists({
  tasks,
  today,
  tomorrow,
  onAdd,
  onDone,
  kinds = ["mission", "order"],
}: {
  kinds?: TaskKind[];
  tasks: Task[] | null;
  today: string;
  tomorrow: string;
  onAdd?: (k: TaskKind) => void;
  onDone: (t: Task) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [askId, setAskId] = useState<string | null>(null); // 「終わった？」の確認中
  return (
    <div className="todo-lists">
      {kinds.map((k) => {
        const list = (tasks ?? []).filter((t) => t.kind === k).sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"));
        return (
          <section key={k} className={`todo-box todo-${k}`}>
            <div className="row between center-y">
              <b>
                {k === "mission" ? "🎯 " : "📦 "}
                {TASK_LABEL[k]} <span className="muted small">{list.length ? `${list.length}件` : ""}</span>
              </b>
              {onAdd && (
                <button className="btn ghost small" onClick={() => onAdd(k)}>
                  ＋ 追加
                </button>
              )}
            </div>
            {list.length === 0 && <p className="muted small">いまはなし！</p>}
            {list.map((t) => {
              const d = dueLabel(t.due, today, tomorrow);
              const hot = !!t.due && t.due <= today;
              const open = openId === t.id;
              return (
                <div key={t.id} className="todo-item">
                  <button className={`todo-check ${askId === t.id ? "on" : ""}`} aria-label="完了" onClick={() => setAskId(askId === t.id ? null : t.id)}>
                    ✓
                  </button>
                  <div className="grow" onClick={() => setOpenId(open ? null : t.id)}>
                    <div>
                      {t.title}
                      {d && <span className={`todo-due ${hot ? "hot" : ""}`}>{d}</span>}
                    </div>
                    {(t.who || !!t.photoCount) && (
                      <div className="muted small">
                        {t.who ? `${t.who}さん` : ""}
                        {t.photoCount ? ` 📷${t.photoCount}` : ""}
                      </div>
                    )}
                    {askId === t.id && (
                      <div className="todo-ask" onClick={(e) => e.stopPropagation()}>
                        <span className="small">終わった？</span>
                        <button
                          className="btn primary small"
                          onClick={() => {
                            setAskId(null);
                            finishTask(t.id);
                            onDone(t);
                          }}
                        >
                          終わった！
                        </button>
                        <button className="btn ghost small" onClick={() => setAskId(null)}>
                          まだ
                        </button>
                      </div>
                    )}
                    {open && (
                      <div className="todo-detail" onClick={(e) => e.stopPropagation()}>
                        {t.todo.length > 0 && (
                          <ul>
                            {t.todo.map((x) => (
                              <li key={x}>{x}</li>
                            ))}
                          </ul>
                        )}
                        {t.reply && (
                          <>
                            <pre className="line-text">{t.reply}</pre>
                            <button className="btn primary small" onClick={() => window.open(lineUrlFor(t.reply), "_blank")}>
                              LINEで返信
                            </button>
                          </>
                        )}
                        {t.raw && <p className="muted small">もとの文：{t.raw.slice(0, 200)}</p>}
                        <Photos taskId={t.id} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

/** タスクにつけた写真。タップで大きく、＋で追加 */
function Photos({ taskId }: { taskId: string }) {
  const photos = useQuery<TaskPhoto>(taskPhotosQuery(taskId), [taskId]);
  const [big, setBig] = useState<TaskPhoto | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="photo-row">
      {(photos ?? []).map((p) => (
        <span key={p.id} className="photo-thumb" onClick={() => setBig(p)}>
          <img src={p.data} alt="" />
        </span>
      ))}
      <label className="photo-add">
        {busy ? "…" : "＋📷"}
        <input
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={async (e) => {
            const files = Array.from(e.target.files ?? []).slice(0, 4);
            e.target.value = "";
            setBusy(true);
            try {
              for (const f of files) await addTaskPhoto(taskId, await shrinkImage(f));
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      {big && (
        <div className="photo-big" onClick={() => setBig(null)}>
          <img src={big.data} alt="" />
          <button
            className="btn ghost small"
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm("この写真を消しますか？")) {
                deleteTaskPhoto(big);
                setBig(null);
              }
            }}
          >
            この写真を消す
          </button>
        </div>
      )}
    </div>
  );
}
