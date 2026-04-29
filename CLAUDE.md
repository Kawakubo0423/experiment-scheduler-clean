@AGENTS.md

# LabLink 開発ルール

## ファイル構成の原則
- フロントエンドは app/page.js 1ファイルに集約（分割しない）
- バックエンドは functions/index.js 1ファイルに集約
- コード修正は Edit ツールで直接ファイルを編集する

## 壊してはいけない処理
- 申込処理（confirmSubmitRequest）
- 日程確定・変更・解除（handleAssignRequest — runTransaction で confirmedCount を更新）
- 確定解除・削除時の confirmedCount 減算
- participantResponses の upsert（participantRespondedAt に null を書かない — deleteField() を使う）
- メール通知（mail コレクション経由で enqueueMail）
- LINE通知・連携・変更希望フロー（lineWebhook / lineSessions）
- Firestore Rules との整合性（下記参照）
- studyId による研究ごとのデータ分離（slots / requests 両方に必須）
- スロット表示のアコーディオン（申込カードの折りたたみ表示）
- 確定済みサマリーから該当申込へのスクロール

## Firestore 書き込みルール上の必須事項
- participantRespondedAt のリセットは deleteField() を使う（null を書くと Rules に弾かれる）
- capacity / confirmedCount は number 型（int 扱いにしない）
- 管理者判定はメールアドレス一致のみ（email_verified は使わない）
- mail / lineUsers コレクションはクライアントから書き込まない
- studies は公開中なら誰でも read 可、作成・編集・削除は管理者のみ

## writeBatch の上限
- Firestore の writeBatch は 1バッチあたり最大 500 オペレーション
- handleDeleteSlot / handleBulkDelete / resetAll で slots+requests を同時バッチ更新しているため、
  件数が多い場合はバッチを分割する必要がある（現状は未対処）

## Functions デプロイ
- Functions 変更後は `firebase deploy --only functions` でデプロイ
- フロントエンドのみの変更は Vercel が自動デプロイ（main push 後）

## 管理者権限
- NEXT_PUBLIC_ADMIN_EMAILS 環境変数に登録されたメールアドレスがスーパー管理者
- 各研究の adminEmails フィールドに登録されたメールも管理者として機能（その研究のみ）
