import { useEffect, useState } from "react";
import { getRedirectResult } from "firebase/auth";
import { auth } from "./firebase";
import { Me, useMe } from "./lib/hooks";
import { refreshPushToken } from "./lib/push";
import { PraiseProvider } from "./components/Praise";
import { Character } from "./components/Character";
import { Login } from "./pages/Login";
import { Home } from "./pages/Home";
import { Members, csvFromHash } from "./pages/Members";
import { Settings } from "./pages/Settings";
import { OneToOnePage } from "./pages/OneToOnePage";
import { Todos } from "./pages/Todos";
import { Watch } from "./pages/Manager";
import { Booking } from "./pages/Booking";

export function App() {
  const m = location.pathname.match(/^\/b\/([A-Za-z0-9_-]+)/);
  if (m) {
    return (
      <PraiseProvider>
        <Booking token={m[1]} />
      </PraiseProvider>
    );
  }
  return (
    <PraiseProvider>
      <Authed />
    </PraiseProvider>
  );
}

function Authed() {
  const { me, loading, error } = useMe();
  const [redirectErr, setRedirectErr] = useState("");
  useEffect(() => {
    getRedirectResult(auth).catch((e) => setRedirectErr(String(e.message ?? e)));
  }, []);
  useEffect(() => {
    if (me) refreshPushToken(me.user.uid).catch(() => undefined);
  }, [me]);

  if (loading)
    return (
      <div className="page center">
        <Character mood="normal" size={120} say="よみこみ中…ちょっと待ってね" />
      </div>
    );
  if (!me) return <Login error={error || redirectErr} />;
  return <Shell me={me} />;
}

type Tab = "home" | "oneToOne" | "mission" | "order" | "members" | "settings" | "watch";

function Shell({ me }: { me: Me }) {
  const params = new URLSearchParams(location.search);
  const calendarResult = params.get("calendar") ?? undefined;
  const [importCsv, setImportCsv] = useState(csvFromHash);
  const [tab, setTab] = useState<Tab>(importCsv ? (me.role === "manager" ? "members" : "oneToOne") : calendarResult ? "settings" : me.role === "manager" ? "watch" : "home");
  useEffect(() => {
    if (location.search || location.hash) history.replaceState(null, "", "/");
    // 開いたままのタブで取り込み用リンクを開いたとき
    const onHash = () => {
      const csv = csvFromHash();
      if (!csv) return;
      history.replaceState(null, "", "/");
      setImportCsv(csv);
      setTab(me.role === "manager" ? "members" : "oneToOne");
    };
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, []);

  const tabs: [Tab, string][] =
    me.role === "manager"
      ? [
          ["watch", "👀 見守り"],
          ["members", "👥 メンバー"],
          ["settings", "⚙ 設定"],
        ]
      : [
          ["home", "🏠 ホーム"],
          ["oneToOne", "🤝 1to1"],
          ["mission", "🎯 ミッション"],
          ["order", "📦 依頼"],
        ];

  return (
    <div className="app">
      {me.role !== "manager" && tab === "home" && (
        <button className="gear" onClick={() => setTab("settings")} aria-label="設定">
          ⚙
        </button>
      )}
      <main>
        {tab === "home" && <Home me={me} goSchedule={() => setTab("oneToOne")} goSettings={() => setTab("settings")} goTab={setTab} />}
        {tab === "oneToOne" && <OneToOnePage me={me} initialCsv={importCsv} />}
        {tab === "mission" && <Todos me={me} kind="mission" />}
        {tab === "order" && <Todos me={me} kind="order" />}
        {tab === "members" && <Members key={importCsv.length} initialCsv={importCsv} />}
        {tab === "settings" && <Settings me={me} calendarResult={calendarResult} />}
        {tab === "watch" && <Watch me={me} />}
      </main>
      <nav className="tabbar">
        {tabs.map(([k, l]) => (
          <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </nav>
    </div>
  );
}
