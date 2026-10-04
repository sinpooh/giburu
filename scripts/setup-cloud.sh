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
