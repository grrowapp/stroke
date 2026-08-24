## 1. 調査

- [x] 1.1 本家の日本語ロケール（`src/dashboard_frontend/src/locales/ja.json`）から、下層4画面に対応する `steeringPage` / `specsPage` / `tasksPage` / `approvalsPage` の文言を読み出す
- [x] 1.2 稼働中の本家ダッシュボードを実ブラウザで開き、一覧まわりの computed 値を実測する（結果は proposal.md - Findings）
- [x] 1.3 本家 CSS の `.status-badge` がどの画面からも使われていないことを確認する。定義と実物が食い違う理由を design.md に残す

## 2. 決定

- [x] 2.1 文言は自前で訳さず本家 `ja.json` をそのまま使うと決める
- [x] 2.2 ステアリングの表示名（`Product` / `Technical` / `Structure`）は本家が i18n を通していないため訳さないと決める
- [x] 2.3 見えのずれは本家 CSS の定義ではなく実測値に合わせると決める

## 3. 文言

- [x] 3.1 `app/pages/projects/[projectId]/steering/index.vue` の見出しと副題を `steeringPage.header` に、列見出しを `steeringPage.table` に、有無バッジを `steeringPage.badge.available`（「利用可」）に差し替える
- [x] 3.2 `app/pages/projects/[projectId]/specs/index.vue` と `specs/[specName]/index.vue` を `specsPage` の文言に差し替える
- [x] 3.3 `app/pages/projects/[projectId]/tasks/index.vue` を `tasksPage.header`（副題は `unselected`）に差し替える
- [x] 3.4 `app/pages/projects/[projectId]/approvals/index.vue` を `approvalsPage.header` と `pendingCount`（「保留中 {n} 件」）に差し替える
- [x] 3.5 各画面に、文言の出どころが本家ロケールであることをコメントで残す

## 4. 構造

- [x] 4.1 `app/components/workspace/RecordList.vue` の `labels` に `actions` を足し、操作列に見出しを出す。`w-12` の固定は外す（文字が最小幅を押し広げて他の列を圧迫するため）
- [x] 4.2 `app/composables/workspace/useSteeringDocuments.ts` の `STEERING_DOCUMENTS` を `label`（表示名）と `file`（ファイル名）に分け、`SteeringEntry` に `file` を足す
- [x] 4.3 ステアリング一覧の1列目を2段にする（上段が表示名、下段がファイル名）

## 5. 様式

- [x] 5.1 `app/assets/css/main.css` の `.sb-status-badge` の padding を 4px 8px にする。本家 CSS の定義ではなく実測値である旨をコメントに書く
- [x] 5.2 `.sb-status-badge-success` の色を本家実測の green-400 にする。design token を触らない理由をコメントに書く
- [x] 5.3 `.sb-datatable th` を 13px にし、1列目の `padding-left` を 24px にする。本家の 11px から意図的に外れる理由をコメントに書く

## 6. テスト

- [x] 6.1 `e2e/upstream-style.spec.ts` のバッジ padding の期待値を 4px にする。本家 CSS の定義値（`rule.padding`）の assert は残し、定義と実物の二重性が読めるようにする
- [x] 6.2 `e2e/upstream-style.spec.ts` の有無バッジの色の期待値を実測の green-400 にする。`--status-success` トークンへの依存を外す
- [x] 6.3 `yarn build` してから `yarn test` と `yarn test:e2e` を通す（E2E は `.output` を使うのでビルドが要る）
