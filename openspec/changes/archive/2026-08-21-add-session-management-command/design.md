# add-session-management-command — Design

## Context

動機は proposal.md - Why を参照。設計の前提になる実測・実物:

- openspec ルートの解決は `--store <id>` か「cwd から上へ辿って最寄りの `openspec/`」の2択。`--store` 指定時は cwd 側（project）の schema が解決候補から除外される（実測）。schema の解決元は project / user / package の3系統で、**user レベル（`~/.local/share/openspec/schemas/`）は cwd に依存せず効く**
- `openspec init --tools none` で AI ツール連携ファイルを作らずに openspec ルートを非対話で初期化できる。スキーマ `flontier-strokeflow` は user レベルに配置済みで解決可能（いずれも確認済み）
- `openspec-ff-change` スキルは change の作成（`openspec new change`）から始まり、実装に必要な artifacts まで一気に作る。サーバが change を先に作っておく必要が無い
- 既存 endpoint は `server/api/[id]/<action>.<method>.ts` の形（セッション配下）と `server/api/overview.post.ts`（トップレベル）。契約は「1リソース1パス、書き手は POST」（`docs/api-contract.md`）
- 実行中判定は `server/utils/running.ts` の in-memory な Set。永続側では `state.json` の `invocation`（`running | idle | failed`）が呼び出し実行状態を持つ
- `nuxt build` の出力はバンドルされたサーバと公開ファイルだけで、リポジトリの任意のファイルは同梱されない（実測・proposal 参照）
- `server/utils/session-store.ts` は Nitro の `useRuntimeConfig`（`claude-config.ts` 経由）と `createError` に依存している

## Goals / Non-Goals

**Goals:**

- セッション作成をセッションディレクトリ完結の形（init + config.yaml）に変え、store への依存を断つ
- 削除・一覧・作成の実体を1つ置き、endpoint と script の両方から同じ実体を呼ぶ
- サーバが動いていないときの削除・一覧・作成を成立させる

**Non-Goals:**

- セッションディレクトリの置き場（`/var/lib/stroke-board/sessions`）の変更
- スキーマ `flontier-strokeflow` の内容の設計（user レベルに在るものを使う）
- store 時代に作られた既存セッションの移行と削除。作り直しとする（change がセッションの外に在る旧形式は、この change の削除の対象外）
- 管理画面（UI）。口は endpoint と script だけ

## Decisions

### 1. セッション作成は「mkdir → `openspec init --tools none` → config.yaml 上書き」。change は作らない

`createSession` の並びを「セッションディレクトリ作成 → `openspec init --tools none`（cwd = セッションディレクトリ）→ `openspec/config.yaml` を `schema: <設定値>` で上書き → 状態ファイル書き込み」にする。途中で失敗したら作りかけのセッションディレクトリごと消して失敗を返す（半端なセッションを残さない）。change はサーバでは作らない——初回呼び出しの `openspec-ff-change` スキルが `new change` から始めるため、サーバ側の先行作成は不要になる。

- schema 名は `runtimeConfig.claude.workflowSchema`（既定 `flontier-strokeflow`、`NUXT_CLAUDE_WORKFLOW_SCHEMA` で上書き）として持つ。`storeId` と `opsxCommand` は削除する
- 代替案（却下）: サーバが change も作っておく — ff スキルの1手目と二重になり、「同じ規定を2つ実装しない」に反する

### 2. 初回 prompt は固定文言で `/openspec-ff-change` を指示する

`firstPrompt()` は設定値を参照せず、次の固定文言にする: `/openspec-ff-change draft-proposal`（change 名は**スキルの引数として**渡す）＋「スキルの指示に従って作業を実施する」。スキルの Input 規定は「request に change 名または説明を含めること」で、名前が無いと Step 1 の「ユーザーに聞き返す」手順に入り、headless の `claude -p` では成立しない。引数で渡せばスキル自身が `openspec new change` から実行する。change 名は全セッションで固定の1つとする——openspec ルートがセッションごとに分かれたため、共有 store 時代に衝突回避で必要だった uuid 名の理由が消えた。受け手のエージェントはこのリポジトリの語彙も openspec の内部構造も知らない前提で書く。取得の手段（`openspec instructions` 等）はスキル自身が手順として持っているため、prompt では指示しない。store の一文は消える。継続 prompt（`continuePrompt`）は変えない。

### 3. 実体は Nitro 非依存の core に切り出し、endpoint と script が同じものを呼ぶ

セッションの作成・削除・列挙の実体を、Nitro に依存しない module（`server/utils/session-core.ts`）へ切り出す。

- core は `useRuntimeConfig` を呼ばない。必要な値（schema 名）は引数で受ける。sessions の置き場は `server/utils/paths.ts` の定数を両経路が import する
- core は `createError` を投げない。失敗は種別を持つ own の Error で表し、endpoint 側 wrapper が HTTP のステータスへ写す。script 側は終了コードとメッセージへ写す
- schema 名の解決は両経路とも「`NUXT_CLAUDE_WORKFLOW_SCHEMA` があればそれ、無ければ既定 `flontier-strokeflow`」。Nitro の runtimeConfig の解決順と同じになるため、経路で挙動が割れない

### 4. 削除の実体はセッションディレクトリの再帰削除1発

新配線ではセッションに属するもの（状態・生成物・openspec ルートと change）が全てセッションディレクトリ配下に収まるため、セッションディレクトリを消せば規定（「何も残らない」）を満たす。

削除は存在検査（`sessionExists` 相当）→ `fs-extra` の `remove(sessionDir)` の1関数で行う。`fs-extra` を dependencies に追加する。

### 5. 実行中判定は経路ごとに材料を定める

- **endpoint**: 既存 `running.ts`（in-memory）が正。実行中なら busy と同じ 409 で拒否する
- **script**: サーバ無しでは in-memory の材料が無いため、`state.json` の `invocation` が `running` なら実行中と見なして拒否する
- サーバがクラッシュすると `invocation: running` が残り、script で消せないセッションが生まれ得る。この不整合の解消（強制削除や状態の修復）はこの change に入れない。Risks に記す

### 6. endpoint は既存の形に合わせて2つ足す

- 削除: `POST /api/<uuid>/delete`（`server/api/[id]/delete.post.ts`）。書き手は POST の契約に合わせる
- 一覧: `GET /api/sessions`（`server/api/sessions.get.ts`）。読み手は GET。各件は `{ id, phase, updatedAt }`。`updatedAt` は `state.json` の mtime（「いつのものか」の時点情報）
- `docs/api-contract.md` に両方を追記する

### 7. script は `tsx` で TS を直接実行する

`scripts/session.ts` に create / delete / list のサブコマンドを持たせ、`package.json` の `"session": "tsx scripts/session.ts"` で `yarn session <cmd>` として実行する。devDependency に `tsx` を足す。script はリポジトリのチェックアウト上で実行する前提とする（ビルド成果物には含めない。サーバが動いているときは endpoint が同じことを担う）。

- 代替案（却下）: Node の type stripping で `node scripts/session.ts` — 動作する Node の版の条件が絡み、実行環境の前提が増える。`tsx` なら依存1つで版に依らず確定する
- 代替案（却下）: script を JS で書く — core（TS）を import できず、実体の複製が生まれる

## Risks / Trade-offs

- [サーバのクラッシュで `invocation: running` が残ると、script で消せないセッションが残る] → この change では扱わない。起きたときは `state.json` を直すか、サーバ復旧後に endpoint から消す。恒久策（起動時の残骸検出など）は必要になったら別 change で起こす
- [openspec の版上げで `init` の生成物や user レベル解決の挙動が変わる] → 着手時の通し実測（tasks 先頭に置く）で確定してから配線する
- [`flontier-strokeflow` の schema.yaml に `apply:` ノードが無く、ff スキルが必要 artifacts の集合を組む起点 `applyRequires` が空になる可能性] → tasks 先頭の通し実測で `openspec status --json` の `applyRequires` を確認する。空で ff が進まない場合は、schema に `apply.requires: [proposal]` を足して解決する（スキーマ側の1行で、アプリの設計は変わらない）
- [schema が user レベルに無いマシンでは動かない] → 動かすための手順（`~/.local/share/openspec/schemas/` への配置）を README / docs に明記する。登録簿と違い id 衝突は無く、別ワークツリーを黙って読む事故も起きない
- [`GET /api/sessions` がセッション数に比例して `state.json` を読む] → 単一ユーザーの MVP では問題にならない。実測で遅くなったときだけ対処する

## Migration Plan

1. 通し実測: 空ディレクトリで `init --tools none` → `config.yaml` 上書き → `openspec-ff-change` 相当の `new change`（cwd = そのディレクトリ・store 無し）→ `instructions` が `flontier-strokeflow` で通ること
2. `claude-config.ts` / `nuxt.config.ts`: `storeId`・`opsxCommand` を削除し `workflowSchema` を追加
3. `session-core.ts` を切り出し、`session-store.ts` / endpoint を core 経由に組み替え
4. `openspec.ts`: change 作成の実行を廃し init + config.yaml へ。change 削除は core の削除（ディレクトリ削除）に吸収
5. `prompt.ts`: 固定文言へ変更
6. endpoint 2本と `scripts/session.ts` を追加、`package.json` に `tsx` と `session` を登録
7. `workflow/` を撤去。`docs/api-contract.md` / `docs/session-workflow.md` / `README.md` を更新
8. Rollback: コードを戻すのみ。user レベル schema・登録簿は残置しても無害

## Open Questions

無し。
