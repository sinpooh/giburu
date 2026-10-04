# ギブる 公開までの手順（初回だけ）

シンプーさん向け。上から1つずつ進めればOKです。わからない画面が出たら、スクショをスレッドに貼ってください。

所要時間の目安：全部で30分くらい（待ち時間込み）。

---

## 手順1　Googleログインを有効にする（Firebase）

1. パソコンのChromeで [Firebaseコンソールの Authentication](https://console.firebase.google.com/project/giburu-178f1/authentication/providers) を開く
2. 「始める」ボタンが出たら押す
3. 「ログイン プロバイダ」の一覧から **Google** を押す
4. 右上のスイッチを **有効にする** にする
5. 「プロジェクトのサポートメール」で `sinpooh@urukau-ichioshi.com` を選ぶ
6. **保存** を押す
7. もう一度 **Google** の行を押して開き、下の方の **「ウェブ SDK 構成」** を開く
8. **ウェブ クライアント ID** と **ウェブ クライアント シークレット** をメモ帳にコピーしておく（手順4で使います。スレッドには貼らないでください）

## 手順2　ログインとカレンダーの戻り先を登録する（Google Cloud）

1. [Google Cloud の「認証情報」](https://console.cloud.google.com/apis/credentials?project=giburu-178f1) を開く
2. 「OAuth 2.0 クライアント ID」の中の **Web client (auto created by Google Service)** を押す
3. 「承認済みのリダイレクト URI」の **＋ URI を追加** を押して、次の2つを1行ずつ追加する
   - `https://giburu-178f1.web.app/__/auth/handler`
   - `https://giburu-178f1.web.app/api/calendar/callback`
4. 一番下の **保存** を押す

## 手順3　カレンダー連携が7日で切れないようにする（OAuth同意画面）

1. [Google Auth Platform の「ブランディング」](https://console.cloud.google.com/auth/branding?project=giburu-178f1) を開く
2. 「アプリ名」を **ギブる** にして保存（サポートメールは `sinpooh@urukau-ichioshi.com`）
3. [「対象」](https://console.cloud.google.com/auth/audience?project=giburu-178f1) を開く
4. 「公開ステータス」が **テスト中** なら **アプリを公開** → **確認** を押す（「本番環境」になればOK）

> 審査は受けないので、青山さんが許可するときに「このアプリは Google で確認されていません」と出ます。「詳細」→「ギブる（安全ではないページ）に移動」で進めば大丈夫です。

## 手順4　サーバの準備をまとめて行う（Cloud Shell）

1. [Cloud Shell](https://shell.cloud.google.com/?project=giburu-178f1&show=terminal) を開く（黒い画面が出ます。「承認」を聞かれたら **承認**）
2. 下の枠の中身を **全部** コピーして黒い画面に貼り付け、**Enter**
3. 途中で「ウェブクライアントID」「ウェブクライアントシークレット」を聞かれたら、手順1でメモしたものをそれぞれ貼り付けて **Enter**（シークレットは貼っても画面に出ませんが、入っています）
4. 最後に **プロジェクト番号**（数字）が出たら、その数字をギブるのスレッドに貼る

```bash
cat > setup.sh <<'SETUP_EOF'
#!/bin/bash
# ギブる初回セットアップ（Google Cloud Shell で1回だけ実行）
# - 必要なAPIをON、Firestore（東京）を作成
# - GitHub から鍵なしでデプロイできるようにする（Workload Identity）
# - カレンダー連携用のクライアントID・シークレットを Secret Manager に保存
set -e
PROJECT=giburu-178f1
REPO=sinpooh/giburu
SA=github-deploy@$PROJECT.iam.gserviceaccount.com

gcloud config set project $PROJECT
echo "▶ APIをONにしています（数分かかります）"
gcloud services enable calendar-json.googleapis.com firestore.googleapis.com cloudfunctions.googleapis.com \
  run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com cloudscheduler.googleapis.com \
  eventarc.googleapis.com pubsub.googleapis.com secretmanager.googleapis.com firebasehosting.googleapis.com \
  firebaserules.googleapis.com iamcredentials.googleapis.com sts.googleapis.com fcm.googleapis.com \
  identitytoolkit.googleapis.com cloudresourcemanager.googleapis.com

echo "▶ Firestore（東京）"
gcloud firestore databases describe --database="(default)" >/dev/null 2>&1 \
  || gcloud firestore databases create --location=asia-northeast1

echo "▶ デプロイ用アカウント"
gcloud iam service-accounts describe $SA >/dev/null 2>&1 \
  || gcloud iam service-accounts create github-deploy --display-name="GitHub deploy"
for r in roles/editor roles/firebase.admin roles/cloudfunctions.admin roles/run.admin roles/iam.serviceAccountUser \
  roles/secretmanager.admin roles/resourcemanager.projectIamAdmin roles/cloudscheduler.admin; do
  gcloud projects add-iam-policy-binding $PROJECT --member="serviceAccount:$SA" --role=$r --condition=None -q >/dev/null
done

echo "▶ 関数を動かすアカウント（新しいプロジェクトは権限が空なので足す）"
NUM0=$(gcloud projects describe $PROJECT --format='value(projectNumber)')
for r in roles/editor roles/cloudbuild.builds.builder; do
  gcloud projects add-iam-policy-binding $PROJECT --member="serviceAccount:${NUM0}-compute@developer.gserviceaccount.com" --role=$r --condition=None -q >/dev/null
done

echo "▶ GitHubとの連携"
gcloud iam workload-identity-pools describe github --location=global >/dev/null 2>&1 \
  || gcloud iam workload-identity-pools create github --location=global --display-name=GitHub
gcloud iam workload-identity-pools providers describe github --location=global --workload-identity-pool=github >/dev/null 2>&1 \
  || gcloud iam workload-identity-pools providers create-oidc github --location=global --workload-identity-pool=github \
    --issuer-uri=https://token.actions.githubusercontent.com \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
    --attribute-condition="assertion.repository=='$REPO'"
NUM=$(gcloud projects describe $PROJECT --format='value(projectNumber)')
gcloud iam service-accounts add-iam-policy-binding $SA --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$NUM/locations/global/workloadIdentityPools/github/attribute.repository/$REPO" >/dev/null

echo "▶ カレンダー連携の鍵"
read -r -p "ウェブクライアントID を貼り付けてEnter: " CID
read -r -s -p "ウェブクライアントシークレット を貼り付けてEnter（画面には出ません）: " CSEC; echo
for n in GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET; do
  gcloud secrets describe $n >/dev/null 2>&1 || gcloud secrets create $n --replication-policy=automatic >/dev/null
done
printf %s "$CID" | gcloud secrets versions add GOOGLE_CLIENT_ID --data-file=- >/dev/null
printf %s "$CSEC" | gcloud secrets versions add GOOGLE_CLIENT_SECRET --data-file=- >/dev/null

echo ""
echo "=========================================="
echo " 完了！この番号をギブるのスレッドに貼ってください"
echo "   プロジェクト番号: $NUM"
echo "=========================================="
SETUP_EOF
bash setup.sh
```

## 手順5　公開（Claudeがやります）

プロジェクト番号を受け取ったら、Claudeが設定して公開します。終わったら `https://giburu-178f1.web.app` が開けるようになります。

## 手順6　青山さんのiPhoneに入れる（青山さんと一緒に、5分）

1. 青山さんのiPhoneの **Safari** で `https://giburu-178f1.web.app` を開く
2. 画面下の **共有ボタン**（□に↑）→ **ホーム画面に追加** → **追加**
3. ホーム画面の店長アイコンから開き直す → **Googleでログイン**（`omochi.mochi0567@gmail.com`）
4. ホームの「はじめの準備」→ **Googleカレンダーをつなぐ** → 青山さんのアカウントで **許可**
5. 「はじめの準備」→ **通知をONにする** → **許可**
6. 設定の **テスト通知** で通知が届くか確認
7. メンバーを何人か追加 → ホームの **1to1の候補を出す** → 右スワイプ！

シンプーさん・渡辺さんは、それぞれのスマホかパソコンで同じURLを開いてログインすると「店長モード」になります。

## （おすすめ）予算アラート

[お支払い > 予算とアラート](https://console.cloud.google.com/billing/budgets) で月500円のアラートを作っておくと安心です。
