# LabLink 開発スキル集
> 新しい会話を始めるときにこのファイルを読むことで、過去の開発経緯と重要な判断を素早く把握できます。

---

## アーキテクチャ概要

Next.js 16 App Router + Firebase (Auth / Firestore) + Vercel デプロイ。

```
app/
  page.js                  # ランディングページ（軽量）
  admin/page.js            # 管理者ページ（~5700行・自己完結）
  studies/page.js          # 公開実験一覧
  study/[studyId]/page.js  # 参加者予約ページ
  response/page.js         # 変更希望ページ（?token=xxx）
  components/shared.js     # 参加者系ページ用の共有 UI
  lib/
    firebase.js            # Firebase 初期化・エクスポート
    constants.js           # PERIOD_MAP, DEFAULT_STUDY_ID 等
    study-utils.js         # 募集データ正規化・操作
    slot-utils.js          # スロット操作
    request-utils.js       # 申込ステータス判定
    date-utils.js          # 日付フォーマット
    ics-utils.js           # .ics 生成
```

---

## ルーティング分離の経緯と設計判断

### なぜ分離したか
元々 `app/page.js` 1ファイル（~7800行）にランディング・参加者・管理者ページがすべて混在していた。
URL ベースのルーティングにすることで、直接リンク共有・SEO・ページ独立性を確保するため分離。

### 分離の方法
- 参加者系（`/studies`, `/study/[studyId]`, `/response`）: `app/components/shared.js` に共有 UI をエクスポートし、各ページが自己完結
- 管理者（`/admin`）: `app/page.js` からコンポーネント・ステート・ハンドラーをすべてコピーして `app/admin/page.js` を作成

### ページ間ナビゲーション
```js
// app/page.js から管理者ページへ
window.location.href = "/admin";

// 管理者ページからトップへ戻る（admin/page.js 内）
function navigateToLanding() { window.location.href = "/"; }

// 管理者ログアウト後
window.location.href = "/";
```

### 注意：useSearchParams は Suspense でラップが必要
```jsx
// app/response/page.js のパターン
export default function ResponsePage() {
  return (
    <Suspense fallback={<div>読み込み中...</div>}>
      <ResponseContent />  {/* ← ここで useSearchParams() を使う */}
    </Suspense>
  );
}
```

---

## Firestore セキュリティの重要パターン

### 管理者権限の2層構造
| 層 | 判定場所 | 仕組み |
|----|---------|--------|
| スーパー管理者 | クライアント側: `NEXT_PUBLIC_ADMIN_EMAILS` 環境変数 | 全スタディ管理可能 |
| スーパー管理者 | Firestore Rules: `isAdmin()` でハードコード | **環境変数とは別管理** |
| 研究者（スタディ管理者） | Firestore Rules: `isStudyAdmin(studyId)` | `studies.adminEmails` を参照 |

**罠**: `NEXT_PUBLIC_ADMIN_EMAILS` と Firestore Rules の `isAdmin()` メールリストは別ファイルで別々に管理。両方を更新しないと PERMISSION_DENIED が発生する。

### slots/requests subscription の初期化パターン（重要）
`DEFAULT_STUDY_ID` へのアクセス権がないユーザーが `/admin` を開くと PERMISSION_DENIED になる。
必ず `adminStudies` のロード完了を待ってから subscribe する。

```js
useEffect(() => {
  if (!firebaseReady || page !== "admin" || !authUser) return undefined;
  if (adminStudiesLoading) return undefined;          // ← ロード完了を待つ
  if (adminStudies.length === 0) return undefined;    // ← スタディなしはスキップ
  if (!adminStudies.some((s) => s.id === selectedStudyId)) {
    setSelectedStudyId(adminStudies[0].id);           // ← 自動で最初のスタディに切り替え
    return undefined;
  }
  // ここで onSnapshot を開始...
}, [page, authUser, selectedStudyId, adminStudies, adminStudiesLoading]);
```

### Firestore Rules の必須制約
```js
// NG: null を書くと Rules に弾かれる
{ participantRespondedAt: null }

// OK: deleteField() を使う
{ participantRespondedAt: deleteField() }
```

---

## 壊してはいけない処理（変更前に必ず確認）

### 1. handleAssignRequest（日程確定）
`runTransaction` で `confirmedCount` をアトミックに更新。並行書き込みのリスクがあるため、`updateDoc` への安易な変更は禁止。

```js
// slots の confirmedCount を +1/-1 する際は必ず runTransaction を使う
await runTransaction(firestore, async (transaction) => {
  const slotSnap = await transaction.get(slotRef);
  const current = Number(slotSnap.data().confirmedCount || 0);
  transaction.update(slotRef, { confirmedCount: current + 1 });
});
```

### 2. participantResponses の upsert
申込削除時に token を無効化する処理。`participantRespondedAt` に `null` を書かない。

### 3. studyId によるデータ分離
`slots` / `requests` の両コレクションで `studyId` フィールドが必須。クエリも必ず `where("studyId", "==", selectedStudyId)` で絞る。

### 4. writeBatch の 500 件上限
`handleBulkDelete` / `resetAll` で slots+requests を同時バッチ削除するため、件数が多い場合はバッチ分割が必要（現状は未対処）。

---

## Firestore コレクション構造

| コレクション | 用途 | 主なフィールド |
|-------------|------|--------------|
| `studies` | 実験募集情報 | `title`, `adminEmails`, `isPublished`, `customFields`, `notificationTemplates` |
| `slots` | 予約枠 | `studyId`, `date`, `periodKey`, `capacity`, `confirmedCount`, `isPublished` |
| `requests` | 申込 | `studyId`, `assignedSlotId`, `participantResponseToken`, `participantConfirmationStatus` |
| `participantResponses` | 参加者確認ページ | `token` がドキュメントID。`participantConfirmationStatus`: `pending`/`confirmed`/`change_requested`/`invalid` |
| `researchers` | 研究者登録 | `uid`, `email`, `status`: `pending`/`approved`/`rejected` |
| `studyTemplates` | 募集テンプレート | `ownerEmail`, 募集フォームの内容 |
| `settings/experimentInfo` | レガシー実験情報 | タイトル・説明等 |
| `mail` | メール送信キュー | **クライアントからの直接書き込み禁止** |
| `lineUsers`, `lineSessions` | LINE連携 | **クライアントからの直接書き込み禁止** |

---

## 実装済み機能一覧

- [x] 参加者向けルート分離（`/studies`, `/study/[studyId]`, `/response`）
- [x] 管理者ルート分離（`/admin`）
- [x] カスタム項目（`customFields`）— 管理者での定義・参加者フォーム・申込カード表示・CSV出力
- [x] 通知テンプレート（`notificationTemplates`）— Functions でメール送信時に適用
- [x] 募集テンプレート（`studyTemplates`）— 保存・読み込み UI
- [x] 研究者登録・承認フロー
- [x] LINE連携（友だち追加 → リンクコード送信）
- [x] CSV エクスポート（申込一覧）
- [x] .ics カレンダー追加
- [x] 一括操作（公開/非公開/メモ更新/削除）

---


