# ギブる

BNIメンバー青山さん専用の段取りアプリ（PWA）。1to1の相手選び・空き枠探し・LINE文面・カレンダー登録・リマインド・お礼までをギブるが用意し、青山さんは出てきたカードをスワイプするだけ。シンプーさんは見守り画面で見守り・お願い・褒めるができ、渡辺さんは青山さんと同じ画面を見るだけ。

- 設計: プロジェクトの `plan/02_設計.md`
- 公開手順（初回）: [docs/SETUP.md](docs/SETUP.md)

## 構成

```
web/        PWA本体（React + TypeScript + Vite、vite-plugin-pwa）
  src/pages/    ホーム・予定・メンバー・設定・見守り・相手用の候補選択ページ（/b/{token}）
  src/sw.ts     Service Worker（オフライン用キャッシュ＋プッシュ通知の表示）
functions/  Cloud Functions 第2世代（asia-northeast1）
  src/index.ts  呼び出し用API・候補選択API・15分ごとの定期処理（一服タイム通知・催促・期限切れ・お礼カード）
  src/logic.ts  空き枠の選び方・誘う順番・カードの並び順（テストあり）
  src/calendar.ts Googleカレンダー連携（リフレッシュトークンは private/calendar にだけ保存）
firestore.rules  許可リストの3人だけ読み書きできる
scripts/setup-cloud.sh  初回のクラウド準備（Cloud Shell で実行）
.github/workflows/deploy.yml  main に入ったら Firebase に公開
```

ログインできるアカウントは `web/src/config.ts`・`functions/src/config.ts`・`firestore.rules` の3か所に同じ内容で書いてある。

## 手元で動かす

```bash
cd functions && npm ci && npm run build
printf 'GOOGLE_CLIENT_ID=dummy\nGOOGLE_CLIENT_SECRET=dummy\n' > .secret.local
echo 'APP_URL=http://127.0.0.1:5173' > .env.local
cd .. && npx firebase-tools emulators:start --only auth,firestore,functions
# 別のターミナルで（web/.env.emulator にエミュレータ用の設定を置く。README末尾参照）
cd web && npm ci && npx vite --mode emulator
```

`web/.env.emulator`:

```
VITE_USE_EMULATORS=1
VITE_FIREBASE_API_KEY=fake-api-key
VITE_FIREBASE_AUTH_DOMAIN=127.0.0.1
VITE_FIREBASE_PROJECT_ID=giburu-178f1
VITE_FIREBASE_APP_ID=1:1:web:1
VITE_FIREBASE_MESSAGING_SENDER_ID=1
```

テスト: `cd functions && npm test`
