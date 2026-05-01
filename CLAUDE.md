@AGENTS.md

# LabLink 開発ルール

## ルーティング構成（Next.js App Router）
| URL | ファイル | 役割 |
|-----|---------|------|
| `/` | `app/page.js` | ランディングページのみ。管理者ボタンは `/admin` に遷移 |
| `/admin` | `app/admin/page.js` | 管理者ページ（自己完結・Firebase Auth 付き） |
| `/studies` | `app/studies/page.js` | 公開中の実験一覧 |
| `/study/[studyId]` | `app/study/[studyId]/page.js` | 参加者予約ページ |
| `/response` | `app/response/page.js` | 変更希望ページ（`?token=xxx`） |

## 共有コンポーネント・ユーティリティ
- `app/components/shared.js` — UI コンポーネント・アイコン・定数をエクスポート（参加者ページが import）
- `app/lib/firebase.js` — Firebase 初期化（`firebaseReady`, `firebaseAuth`, `firestore` をエクスポート）
- `app/lib/constants.js` — 定数（`PERIOD_MAP`, `DEFAULT_STUDY_ID` 等）
- `app/lib/study-utils.js` — 募集データの正規化・操作
- `app/lib/slot-utils.js` — スロットのソート・表示ラベル
- `app/lib/request-utils.js` — 申込ステータス判定・ラベル
- `app/lib/date-utils.js` — 日付フォーマット
- `app/lib/ics-utils.js` — .ics ファイル生成

## 壊してはいけない処理
- **申込処理**（`confirmSubmitRequest` in `app/study/[studyId]/page.js`）
- **日程確定・変更・解除**（`handleAssignRequest` — `runTransaction` で `confirmedCount` を更新）
- **確定解除・削除時の `confirmedCount` 減算**（`handleDeleteRequest`, `handleDeleteSlot`, `handleBulkDelete`）
- **`participantResponses` の upsert**（`participantRespondedAt` に `null` を書かない — `deleteField()` を使う）
- **メール通知**（`mail` コレクション経由で `enqueueMail`、クライアントから直接書かない）
- **LINE通知・連携・変更希望フロー**（`lineWebhook` / `lineSessions`）
- **Firestore Rules との整合性**（下記参照）
- **`studyId` によるデータ分離**（`slots` / `requests` 両方に必須）
- **スロット表示のアコーディオン**（申込カードの折りたたみ表示）
- **確定済みサマリーから該当申込へのスクロール**

## Firestore 書き込みルール上の必須事項
- `participantRespondedAt` のリセットは `deleteField()` を使う（`null` を書くと Rules に弾かれる）
- `capacity` / `confirmedCount` は `number` 型
- 管理者判定はメールアドレス一致のみ（`email_verified` は使わない）
- `mail` / `lineUsers` コレクションはクライアントから書き込まない
- `studies` は公開中なら誰でも read 可、作成・編集・削除は管理者のみ

## Firestore セキュリティ上の注意（ルーティング分離後）
- `app/admin/page.js` の slots/requests subscription は `adminStudies` のロード完了を待ってから開始する
- `selectedStudyId` が `adminStudies` に含まれていない場合は最初のスタディに自動切り替えする
- これは `DEFAULT_STUDY_ID` へのアクセス権がないユーザーの PERMISSION_DENIED を防ぐため

## 管理者権限の2層構造
- **スーパー管理者**：`NEXT_PUBLIC_ADMIN_EMAILS` 環境変数のメール（全スタディを管理可能）
- **研究者（スタディ管理者）**：`studies.adminEmails` フィールドに登録されたメール（その研究のみ）
- Firestore Rules の `isAdmin()` は環境変数ではなくハードコードされたメールリストを参照するため、Firestore Rules と `NEXT_PUBLIC_ADMIN_EMAILS` を別々に管理していることに注意

## writeBatch の上限
- 1バッチあたり最大 500 オペレーション
- `handleDeleteSlot` / `handleBulkDelete` / `resetAll` で slots+requests を同時バッチ更新しているため、件数が多い場合はバッチを分割する必要がある（現状は未対処）

## デプロイ
- **フロントエンド**：`main` ブランチへの push で Vercel が自動デプロイ
- **Firebase Functions**：変更後は `firebase deploy --only functions`
- **Firestore Rules**：変更後は `firebase deploy --only firestore:rules`
