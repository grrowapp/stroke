## Why

下層の各画面の文言は、実装時に stroke-board 側で書き下ろしていた。「本家が持つ仕様書を読む。編集と承認の操作は置かない」のように、**本家に無い説明**が入っている。stroke-board は本家 spec-workflow-mcp の画面を写すものなので、本家と並べたときに言葉がずれる。

本家は日本語ロケール（`src/dashboard_frontend/src/locales/ja.json`）を持っており、同じ画面の文言がそこに揃っている。書き下ろしをやめ、本家の文言をそのまま使う。

あわせて、稼働中の本家を実測したところ、一覧まわりの見えにもずれが見つかった（下の Findings）。文言と同じ理由で、実測値に合わせる。

## Findings（実測）

稼働中の本家ダッシュボードを実ブラウザで開いて computed 値を読んだ結果:

| 対象 | 本家の実測 | 変更前の実装 |
|---|---|---|
| 一覧の操作列 | 見出しを出す（「操作」/「アクション」） | 見出し無し（`sr-only` で幅 48px 固定） |
| ステアリング行の1列目 | 2段（`Product` ＋ `product.md`） | 1段（`product.md` のみ） |
| 状態バッジの padding | 4px 8px | 2px 8px |
| 有無バッジ（あり）の文字色 | `oklch(0.792 0.209 151.711)`（green-400） | `--status-success`（green-500） |

後ろの2つには、定義と実物のずれという背景がある。

- 本家 CSS の `.status-badge` は `padding: 2px var(--space-2)` を持つが、**この class は本家のどの画面からも使われていない**。定義だけが `tailwind.css` に残っている。実際に画面へ出ているバッジは `px-2 py-1` の直書きで、実測 4px 8px。
- 有無バッジも同じく Tailwind 直書き（`dark:bg-green-900/20 dark:text-green-400`）で、design token の `--status-success`（green-500）とは別の色が出ている。

見えを揃えるのが目的なので、**定義ではなく実際に画面へ出ている値**に合わせる。

## What Changes

文言（すべて本家 `ja.json` から取る）:

- ステアリング「ステアリング文書 / プロダクト方針・技術アーキテクチャ・組織構造に関する…」（`steeringPage.header`）
- 仕様書「仕様書 / アクティブな要件・設計・タスク文書を表示・管理」（`specsPage.header`）
- タスク「タスク管理 / 仕様を選択してタスクを表示・管理します」（`tasksPage.header.subtitle.unselected`）
- 承認「承認 / 保留中の承認リクエストをレビュー・管理」「保留中 {n} 件」（`approvalsPage`）
- 一覧の列見出しを本家の `table` に合わせる（「ドキュメント / ステータス / 操作」「名前 / 進捗 / アクション」）
- 有無バッジの「あり」を「利用可」に（`steeringPage.badge.available`）

構造:

- `RecordList` の操作列に見出しを出す。`labels` に `actions` を足す
- ステアリング一覧の1列目を2段にする。上段が表示名（`Product` / `Technical` / `Structure`）、下段がファイル名

様式（`main.css`）:

- 状態バッジの padding を 4px 8px にする
- 有無バッジ（あり）の色を本家実測の green-400 にする
- 一覧の列見出しを 13px にする。1列目だけ左の余白を 24px にする

非目標:

- 上層（ポータル）の文言。今回は下層のみ
- design token（`--status-success` など）の値。接続 dot などで使うので触らない
- 本家に無い操作（承認・却下以外）を足すこと

## Capabilities

### New Capabilities

なし。

### Modified Capabilities

なし。各画面が何を出すかという要件は変わらず、変わるのは文言と見せ方だけ。仕様レベルの振る舞いが変わらないため `.openspec.yaml` に `skip_specs: true` を置く。

## Impact

- `app/components/workspace/RecordList.vue` — `labels.actions` を追加し、操作列に見出しを出す
- `app/composables/workspace/useSteeringDocuments.ts` — `label`（表示名）と `file`（ファイル名）を分ける
- `app/pages/projects/[projectId]/{steering,specs,tasks,approvals}/index.vue` — 文言を差し替え
- `app/pages/projects/[projectId]/specs/[specName]/index.vue` — 文言を差し替え
- `app/assets/css/main.css` — `.sb-datatable th` / `.sb-status-badge` 系
- `e2e/upstream-style.spec.ts` — padding と色の期待値を実測に合わせる

## Decided

- 文言は自前で訳さず、本家 `ja.json` をそのまま使う（2026-08-24）
- ずれの判断は本家 CSS の定義ではなく、稼働中の本家の実測値による（2026-08-24）
