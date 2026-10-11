import { useState } from "react";
import { Me, useNow, useQuery } from "../lib/hooks";
import { TASK_LABEL, Task, TaskKind, addTodo, openTasksQuery } from "../lib/data";
import { DAY, ymd } from "../lib/time";
import { TodoLists } from "../components/TodoLists";
import { TodoForm } from "../components/TodoForm";
import { usePraise } from "../components/Praise";
import { Character } from "../components/Character";

/** 「ミッション」タブ／「依頼」タブ */
export function Todos({ me, kind }: { me: Me; kind: TaskKind }) {
  const now = useNow(60000);
  const tasks = useQuery<Task>(openTasksQuery());
  const [adding, setAdding] = useState(false);
  const { praise } = usePraise();
  const count = (tasks ?? []).filter((t) => t.kind === kind).length;
  return (
    <div className="page">
      <h1>
        {kind === "mission" ? "🎯 " : "📦 "}
        {TASK_LABEL[kind]}
      </h1>
      <div className="row gap center-y">
        <Character mood={count ? "guide" : "praise"} size={70} say={count ? "上から1つずつ片づけよ！" : "ぜんぶ終わり！さすが！"} />
      </div>
      <button className="btn primary todo-add-big" onClick={() => setAdding(true)}>
        ＋ {TASK_LABEL[kind]}を追加
      </button>
      <TodoLists
        kinds={[kind]}
        tasks={tasks}
        today={ymd(now)}
        tomorrow={ymd(now + DAY)}
        onDone={(t) => praise(t.kind === "order" ? `「${t.title}」完了！お客さんも喜びます` : `ミッション「${t.title}」クリア！`)}
      />
      {adding && (
        <TodoForm
          kind={kind}
          onCancel={() => setAdding(false)}
          onSubmit={async (v, photos) => {
            await addTodo({ ...v, byName: me.name }, photos);
            setAdding(false);
            praise("覚えときます！あとは上から片づけるだけ");
          }}
        />
      )}
    </div>
  );
}
