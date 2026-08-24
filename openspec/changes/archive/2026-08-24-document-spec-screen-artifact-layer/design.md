## Context

拡張 artifact の併存方式について、ソースを読んだ範囲では次まで分かっている。この資料はこれを図に落とすものであり、ここで新しい結論は足さない。

- 本家は `specs/<name>/` の未知の `.md` を**読まない**（`core/parser.ts:43-45` が3ファイルを名指し）
- 本家は未知ファイルを**消さない**（削除は `job-scheduler.ts:260,291` の spec ディレクトリ単位のみ）
- archive は `fs.rename` でディレクトリごと動く（`core/archive-service.ts:39,72`）ので未知ファイルも同行する
- ただし watcher は `specs/**/*.md` を見ている（`dashboard/watcher.ts:34`）ため、未知ファイルの保存でも `spec-update` が WS に流れる
- 本家 API に未知ファイルの本文を返す口は無い（`/specs/:name/all` は3キー固定）

## Goals / Non-Goals

**Goals:**

- 仕様書の画面について、現状の流れを本家・stroke-board の両方で図にする
- その図の上に、拡張 artifact の基盤をどこへ挟むかを重ねた図を作る
- 図の粒度を「実装の語で書ける」ところまで下げる

**Non-Goals:**

- 拡張 artifact の定義（schema.yaml 相当）の内容を決めること
- 定義ファイルの置き場所を決めること
- 画面上でどう並べるか（本家の3本と拡張分の見せ方）を決めること
- 実装すること。コードは1行も変えない
- 仕様書の画面以外（承認・タスク・ステアリング・プロジェクト一覧）を図にすること

## Decisions

### 1. 範囲は「仕様書の画面」に限定する

対象は次の3画面に閉じる。

- 一覧: `app/pages/projects/[projectId]/specs/index.vue`
- 1本の概要: `app/pages/projects/[projectId]/specs/[specName]/index.vue`
- 本文: `app/pages/projects/[projectId]/specs/[specName]/[document].vue`

承認・タスク・ステアリングは、同じ接点層を通るが流れが別なので入れない。拡張 artifact が最初に効くのは概要画面（3本固定の並び）なので、ここが最小で意味のある単位になる。

**Alternatives considered:**

- 下層10ページ全部: 図が大きくなり、どこが拡張の当たり所か埋もれる
- 概要画面1つだけ: 一覧（`SpecData.phases`）と本文（`/all`）が別経路なので、1画面だけでは経路の違いが見えない

### 2. 図は3枚。現状2枚 + 提案1枚

1. **現状・本家** — ブラウザ（`SpecsPage.tsx` / `SpecViewerPage.tsx`）→ `multi-server.ts` の REST → `SpecParser` → FS、および `SpecWatcher`(chokidar) → `spec-update` の WS 経路
2. **現状・stroke-board** — 画面 → `useProjectApi.ts` → `server/api/projects/[projectId]/specs/**` → `upstream-proxy` → `UpstreamRestClient` → 本家 REST。あわせて `UpstreamSocket` → `UpstreamMonitor` → `board.ts` → `useBoardSocket` の WS 経路
3. **提案・stroke-board** — 2 のどこに拡張 artifact の層が入るか

本家側を1枚描くのは、stroke-board が何の写像なのかが分からないと、挟む位置の妥当性を判断できないため。

**Alternatives considered:**

- stroke-board だけ2枚: 本家の 3 キー固定がどこで決まっているかが図から消える
- 現状を1枚に統合: 別プロセスの2つの流れが1本に見えてしまう

### 3. 提案の図は「決まったこと」として書かない

`docs/artifact-extension-plan.md` は冒頭で未決定であることを明示し、決まっていない箇所（定義の中身・置き場所・表示の並べ方）は図中でも `?` を残す。

`docs/structure-design.md` が「記述はすべて実装から確認できる事実に限る」と定めているため、提案を同じファイルに混ぜない。事実の図（`docs/spec-screen-flow.md`）と提案の図（`docs/artifact-extension-plan.md`）をファイルごと分ける。

**Alternatives considered:**

- 1ファイルに節を分けて同居: 事実と案の境界が読み手依存になる
- 提案を `openspec/changes/` 側に置く: 資料は `docs/` にという指示に反する

### 4. 図の粒度は「実装の語」で固定する

各メッセージにモジュール名・関数名・エンドポイントを載せる。例: `useSpecDocuments()` → `GET /api/projects/:id/specs/:name/documents` → `upstreamClient().getSpecDocuments()` → `GET /api/projects/:id/specs/:name/all` → `specDocumentsSchema.parse()`。

粒度の下限はここまでとし、関数の内部分岐までは追わない。図が実装の写経になると、コードが動くたびに図が嘘になる。

## Risks / Trade-offs

- **提案の図が独り歩きする** → 冒頭に未決定の明示と、決定は別途行う旨を書く
- **図が実装から乖離する** → 図に載せる名前は実在するシンボルに限り、書いた時点のソースを行番号付きで併記する
- **本家側の図が 2.2.7 に固定される** → ADR-0004 の基準に合わせ、資料にも基準バージョンを明記する
