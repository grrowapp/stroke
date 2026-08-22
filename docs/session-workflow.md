# セッションのワークフロー定義

claude プロセスへの指示は、コードではなく **openspec のワークフロースキーマ**にある。スキーマを編集すれば、コード変更・再ビルド・再起動なしに次回の呼び出しから反映される（`openspec/specs/workflow-definition/spec.md`）。

store（マシン共有の登録簿）は使わない。**登録作業は不要**で、旧 `stroke-sessions` の登録が残っていても参照されない（unregister は任意）。

## 置き場

```
~/.local/share/openspec/schemas/flontier-strokeflow/   ワークフロースキーマ（user レベル配置）
├── schema.yaml                 artifact は stroke → proposal の2段
└── templates/{stroke,proposal}.md

/var/lib/stroke-board/sessions/<uuid>/                 セッションディレクトリ = openspec ルート
├── openspec/
│   ├── config.yaml             schema: flontier-strokeflow（サーバが書く）
│   └── changes/draft-proposal/ 初回呼び出しの openspec-ff-change スキルが作る
├── state.json / strokes.json / overview.txt ほか      アプリが書く状態と生成物

assets/.claude/skills/                                 セッション API スキル6本
├── get-overview/  get-strokes/  get-send-back/        取得
├── question/  proposal/                               提出
└── guidance/                                          案内
```

セッションに属するものは、セッションディレクトリ1箇所に収まる。

## 配線

| 何を | どこで | どう届くか |
|---|---|---|
| スキーマ名 | `runtimeConfig.claude.workflowSchema`（`NUXT_CLAUDE_WORKFLOW_SCHEMA`） | セッション作成時に `openspec/config.yaml` へ書かれる |
| 起動するスキル | `server/utils/stroke/prompt.ts` の固定文言 | 初回 prompt `/openspec-ff-change draft-proposal` |
| 接続先 | `runtimeConfig.claude.apiBaseUrl` | spawn 時の環境変数 `STROKE_BASEURL` |
| セッション id | — | cwd のディレクトリ名と `${CLAUDE_SESSION_ID}` |
| スキル・コマンドの置き場 | `runtimeConfig.claude.addDir` | `--add-dir`（空白区切りで複数） |

セッション作成（`server/utils/stroke/session-core.ts`）は「ディレクトリ作成 → `openspec init --tools none` → `config.yaml` 上書き → 状態ファイル書き込み」。**サーバは change を作らない**。change（固定名 `draft-proposal`）は初回呼び出しの `openspec-ff-change` スキルが `openspec new change` から作る。openspec コマンドの実行は全て cwd = セッションディレクトリで、`--store` はどのコードパスからも使わない。

## 畳み方

- **サーバが動いているとき**: `GET /api/strokes` で一覧し、`POST /api/strokes/<uuid>/delete` で消す（実行中の呼び出しを持つ間は 409）。
- **サーバが動いていないとき**: `yarn session list` / `yarn session delete <uuid>` / `yarn session create "<概要>"`。endpoint と同じ実体（`session-core.ts`）を呼ぶ。実行中判定は `state.json` の `invocation` を材料にする。

## 実測で確定していること

Claude Code 2.1.236 / openspec 1.9.0 で確認し、1.10.0 で以下を再確認・追加した。

- **schema.yaml は全 artifact に `template` が必須**。省くと `openspec instructions` が落ちる。`templates/<file>` の実体も要る。`apply:` ノードは省略できる
- `openspec init --tools none` の生成物は `openspec/{config.yaml, changes/archive, specs}` のみ（AI ツール連携ファイルは作られない）
- `config.yaml` に `schema:` を書けば、`openspec new change` は `--schema` 無しでそのスキーマを既定に使う（1.10.0 で `flontier-strokeflow` にて再確認）
- **schema の解決元は project（cwd から解決した root）・user（`~/.local/share/openspec/schemas/`）・package（CLI 内蔵）の3系統**。user レベルは cwd にも root にも依存せず効く
- **`--store` 指定時は cwd 側（project）の schema が解決候補から除外される**。schema を store と cwd に分けて持つ構成は成立しない
- `flontier-strokeflow` の `applyRequires` は `["stroke","proposal"]`（`apply:` ノード無しでも空にならない）
- 登録簿に別ワークツリーを指す登録が残っていても、`--store` を使わない実行は登録簿を参照しない
- `--add-dir` を複数渡すと、それぞれの `.claude/` からスキルもコマンドも読まれる
- `--session-id` で自前採番した uuid は、スキル内の `${CLAUDE_SESSION_ID}` と一致する
- spawn 時の環境変数はスキルの `!` フェンス事前実行まで届く

## 定義を変えるとき

`~/.local/share/openspec/schemas/flontier-strokeflow/` を編集するだけでよい。サーバは定義を読まずキャッシュも持たないため、**起動済みの呼び出しには影響せず、次回の呼び出しから反映される**。

新しいマシンで動かすには、このスキーマを `~/.local/share/openspec/schemas/` に配置する（`README.md`）。無いままセッションを作ると、claude が指示を取得できず呼び出しが失敗する。
