# remove-store-dependency

## Why

セッションのワークフロー定義は openspec の store 機構で参照している。store の実体は `~/.local/share/openspec/stores/registry.yaml`——**リポジトリの外にある、マシン全体で共有される1つのファイル**で、store id からルートの絶対パスを引く。

この置き方は2つの問題を生んでいる。

- **リポジトリが自立しない。** 動かすには、clone とは別にレジストリへの登録作業が要る。登録が無ければセッション作成の時点で落ちる。登録先が別のワークツリーを指していても、追跡されている定義ファイルは読まれないまま静かに無視される（実際にこの状態が起きた）
- **id が衝突する。** 1つの id につき1つのチェックアウトしか登録できない（`store_id_conflict`）。同じマシンで複数のチェックアウトを動かせない

定義の在り処は、リポジトリの中だけで決まるようにする。

## What Changes

- ワークフロー定義の参照から **store 機構への依存をなくす**。`--store <id>` を使わず、`claude -p` の cwd から openspec のルートが解決できる状態にする
- 設定値 `storeId` を廃する。prompt から store を名指しする一文も外す
- セッションの change を作る処理を、store を介さない形に置き換える
- レジストリへの登録は、動かすための手順から外す

cwd からルートを解決させる具体的な機構（セッションディレクトリへのリンク／セッションディレクトリの位置そのものの変更）は design で決める。

## Capabilities

### Modified Capabilities

- `workflow-definition`: ワークフロー定義の在り処が、リポジトリの中だけで決まる規定を加える。定義の変更が次回の呼び出しから反映されるという既存の要件は変えない

## Impact

- `server/utils/openspec.ts` — セッションの change を作る処理
- `server/utils/claude-config.ts` / `nuxt.config.ts` — `storeId` の廃止
- `server/utils/prompt.ts` — 初回 prompt から store の言及を外す
- `server/utils/session-store.ts` / `paths.ts` — cwd からルートが解決できる形にするための変更（範囲は design で確定）
- `docs/session-workflow.md` / `README.md` — 動かすための手順から登録作業を外す
- `openspec/changes/archive/2026-08-20-claude-p-openspec-workflow/design.md` の決定3（store として登録する）を覆す。定義を1箇所に置き複製しないという同決定の中心は維持する

**着手の順序**: この change を先に済ませる。後続の「絶対パスの runtimeConfig 化」と「セッションのクリーンアップ」は、どちらもセッションディレクトリの位置に依存するため、ここで確定させてから進める。
