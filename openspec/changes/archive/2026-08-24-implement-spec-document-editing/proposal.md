# Proposal — implement-spec-document-editing

## Why

下層の仕様書・ステアリングは今、読むことしかできない。本家は同じ文書に対して編集と保存を持っており、stroke-board で対象を開いても、直したい箇所が見つかった時点で本家のダッシュボードへ移らなければならない。通知から対象へ直行できるようにした意味が、そこで切れる。

承認まわりの機能（注釈・差分）を先に足しても、文書を直せない以上は行き止まりになる。編集が先に要る。

## What Changes

- **仕様書の3文書を編集・保存できるようにする** — `requirements` / `design` / `tasks`
- **ステアリングの3文書を編集・保存できるようにする** — `product` / `tech` / `structure`
- **保存の口を stroke-board のサーバーに追加する** — `PUT /api/projects/:projectId/specs/:specName/:document`、`PUT /api/projects/:projectId/steering/:name`
- **編集は今ある文書のページで行う** — 本家はモーダルだが、stroke-board は文書ごとに URL を持つ設計なので、その URL のまま編集する
- **未保存のまま画面を離れようとしたら引き止める**
- **承認対象の本文とタスク画面は読み取りのまま** — 本家も承認側は編集を持たない

**BREAKING** — `project-workspace` の「下層で状態を変えられるのは承認への応答だけ」が成立しなくなる。

### 本家に合わせるもの / 合わせないもの

| | 本家 | stroke-board |
| --- | --- | --- |
| 保存の単位 | 文書1本ぶんの全文 | **同じ** |
| 保存先の指定 | 文書名は3種に限定 | **同じ** |
| 競合の制御 | 持たない（上書き） | **同じ** |
| 開き方 | 一覧からモーダル | **文書ごとの URL のまま** |
| 文書の切替 | モーダル内のタブ | 既存のページ遷移 |

開き方だけ変える。stroke-board は「どのプロジェクトの何」を URL で指せることを設計の軸にしており、モーダルにすると文書を URL で指せなくなる。

### 今回入れないもの

- **仕様書そのものの作成・削除・アーカイブ** — 本家は持つが、文書の編集とは別の操作
- **注釈** — 承認まわりの change（`implement-approval-annotations`）で扱う
- **差分表示** — 同じく `implement-approval-diff-snapshots`

## Capabilities

### New Capabilities

- `document-editing`: 下層の仕様書とステアリングの文書を、開いているページ上で編集して保存する。保存できる文書の範囲、未保存の扱い、保存の失敗時の見せ方を持つ

### Modified Capabilities

- `project-workspace`: 「下層で状態を変えられるのは承認への応答だけ」が変わる。文書の編集が加わるため、要件の範囲を「承認への応答と、仕様書・ステアリングの文書の編集」に広げる。タスクの状態変更とプロジェクトの登録・解除を持たない点は変わらない

## Impact

**新規**

- `server/api/projects/[projectId]/specs/[specName]/[document].put.ts`
- `server/api/projects/[projectId]/steering/[name].put.ts`
- 編集用のコンポーネント（`app/components/workspace/`）

**変更**

- `server/utils/upstream/rest.ts` — 保存の関数を2つ追加
- `server/utils/control/upstream-proxy.ts` — 保存の経路を通す
- `app/composables/workspace/useProjectApi.ts` — 保存の口を追加
- `app/pages/projects/[projectId]/specs/[specName]/[document].vue`
- `app/pages/projects/[projectId]/steering/[name].vue`
- `app/components/workspace/DocumentView.vue` — 読み取り専用のまま使う画面が残るため、編集は別コンポーネントに分けるか、モードを持たせるかを design で決める

**テスト**

- `server/utils/upstream/read-only.test.ts` — 書き込み関数の範囲を検査しているため、期待値の更新が要る
- E2E に編集・保存・未保存の引き止めを追加

**依存**

- markdown エディタの選定が要る。本家は MDXEditor を使うが、stroke-board は Vue のため同じものは使えない
