# セッションのワークフロー定義

claude プロセスへの指示は2つに分かれる。**どの成果物を作るか**は openspec のワークフロースキーマにあり、スキーマを編集すればコード変更・再ビルド・再起動なしに次回の呼び出しから反映される（`openspec/specs/workflow-definition/spec.md`）。**どう進めるか**（手順）は MCP の案内ツール（`get-guide` / `get-steering-guide`）が返し、本文はツールのソースが持つ。

操作（取得・提出）の入口は MCP ツールだけである。契約は `docs/specs/mcp/tools.md`。

store（マシン共有の登録簿）は使わない。**登録作業は不要**で、旧 `stroke-sessions` の登録が残っていても参照されない（unregister は任意）。

## 置き場

```
~/.local/share/openspec/schemas/flontier-strokeflow/   ワークフロースキーマ（user レベル配置）
├── schema.yaml                 artifact は stroke → proposal の2段
└── templates/{stroke,proposal}.md

/opt/projects/                                         projectShareRoot（設定値。既定値を示す）
├── <uuid>/                                            セッションディレクトリ = openspec ルート
│   ├── openspec/
│   │   ├── config.yaml         schema: flontier-strokeflow（サーバが書く）
│   │   └── changes/                （いま作る者が居ない。下の「openspec ルートの使い手」）
│   ├── docs/proposal.md        claude が書く（サーバーは書かない）
│   └── state.json / strokes.json / overview.txt       アプリが書く状態
└── <name>/                                            承認で <uuid> を改名しただけ
    └── docs/proposal.md        位置は変わらない

server/mcp/tools/                                      MCP ツール8本（ファイル名 = ツール名）
├── get-guide.ts / get-steering-guide.ts               案内（工程の手順）
├── get-overview.ts / get-strokes.ts / get-send-back.ts   取得
├── get-steering.ts                                    取得（本家）
└── send-question.ts / submit-document.ts              提出
```

`assets/.claude/skills/` の旧セッション API スキルは**撤去した**。`--add-dir` を渡さない以上 claude には届かず、代行先はすべて MCP ツールになっている。

残っているのは `template/`（本家由来の文書の雛形）だけで、**いまこれを読む者も居ない**。撤去の対象は「代行先が MCP ツールになった操作系スキル」に限ったので範囲外として残しただけで、要否は判断していない。

セッションに属するものは、セッションディレクトリ1箇所に収まる。**セッションと昇格した
プロジェクトは同じ親（`projectShareRoot`）の下に並ぶ。** 承認はこの親の下での改名だけで
昇格を行うためで、ポータルの一覧もこの親を走査する（`docs/specs/core/settings-reference.md`）。

## 配線

| 何を | どこで | どう届くか |
|---|---|---|
| スキーマ名 | `runtimeConfig.claude.workflowSchema` | セッション作成時に `openspec/config.yaml` へ書かれる |
| 手順の入口 | `runtimeConfig.claude.firstPrompt` ほか | 定型が案内ツール（`get-guide`）の名前を指す。手順の本文は定型に書かない |
| 接続先 | `server/utils/stroke/listen-address.ts` | 起動ごとに組み立てる `--mcp-config` の url。**設定ではなく、サーバーが実際に bind したアドレスから作る**（かつての `claude.apiBaseUrl` は外した）。spawn 時の環境変数 `STROKE_BASEURL` としても渡るが、**読み手はもう居ない** |
| どのセッションか | — | `--mcp-config` の `x-stroke-token`。接続表がセッション id へ解決する。発行・登録・失効は invoke-agent（[invoke-agent.md](./invoke-agent.md)「接続 token の寿命」） |
| 工程ごとの公開ツール | `server/utils/mcp/exposed-tools.ts` | `--mcp-config` の `x-mcp-tools` |
| 作業場所 | — | cwd だけ。`--add-dir` は渡さない |
| steering の定型 | `runtimeConfig.claude.steeringPrompt` | 承認の直後、cwd＝生成先で起動するときに渡る |
| 本家 MCP（steering のみ） | `server/utils/stroke/invoke.ts` | steering 工程の `--mcp-config` に本家 spec-workflow の MCP を並べ、承認依頼のツール `approvals` を許可する（`docs/specs/core/settings-reference.md`「`--allowedTools`」） |

ストローク側の設定を**コードが環境変数から読むことはしない**。値は `nuxt.config.ts` と
`app/app.config.ts` に書かれたものだけで、読み出す実装は `server/utils/stroke/config.ts` の1本である。
一覧は `docs/specs/core/settings-reference.md`。

**「環境変数が効かない」という意味ではない。** 次の3つは事実として押さえておくこと。

1. **`runtimeConfig` は全キーが `NUXT_*` で上書きされうる。** Nitro は `useRuntimeConfig()` の
   たびに `applyEnv` をツリー全体へ掛ける（`nitropack/dist/runtime/internal/config.mjs`。
   この worktree のビルド出力にも `envPrefix: "NUXT_"` が入る）。`NUXT_CLAUDE_COMMAND` も
   `NUXT_CLAUDE_API_BASE_URL` も効く。**コードが読まないだけで、値は差し替えられる**
2. **子プロセスは親の環境を丸ごと継ぐ。** `server/utils/stroke/claude.ts` が
   `env: { ...process.env, STROKE_BASEURL: … }` で spawn する
3. **steering 工程はポータル側の設定 `upstreamBaseUrl` と `specWorkflowHome` を使う。**
   `upstreamBaseUrl` は生成（`POST /api/projects`）の依頼先であり、本家 REST の代行先
   （`server/utils/mcp/upstream-fetch.ts`）であり、invoke-agent が完了時に文書と承認依頼を確かめる
   先でもある。`specWorkflowHome` は steering 工程に並べる本家 MCP の env に渡る。どちらもずらすと
   steering 工程が成立しない

セッション作成（`server/utils/stroke/session-core.ts`）は「ディレクトリ作成 → `openspec init --tools none` → `config.yaml` 上書き → 状態ファイル書き込み」。**サーバは change を作らない**。

### openspec ルートの使い手

**掘ったルートを使う者が、いまは居ない。** change を作っていた `openspec-ff-change` スキルは実体を持たず、定型からも外した。実測（2026-08-31 の2実行）でも、`tool_use` は MCP ツールと claude 内部の `ToolSearch` だけで、`Bash` も `Skill` も0回だった。

**`openspec instructions` を読ませることもできない。** change が無いルートでは `No changes found` で失敗する（instructions は change に紐づく）。案内ツールの本文で「`openspec` コマンドを叩かない」と塞いであるのは、失敗する道具を指すと無人の実行がそこを探り回って時間を使い切るためである（実測 2026-08-31: 21 turns・156 秒）。

掘る側を据え置いてあるのは、案内を配り直して使い手が戻る余地を残すためである。openspec コマンドの実行は全て cwd = セッションディレクトリで、`--store` はどのコードパスからも使わない。

## 畳み方

- **サーバが動いているとき**: `GET /api/sessions` で一覧し、`DELETE /api/sessions/<uuid>` で消す（実行中の呼び出しを持つ間は 409）。
- **サーバが動いていないとき**: `yarn session list` / `yarn session delete <uuid>` / `yarn session create "<概要>"`。endpoint と同じ実体（`session-core.ts`）を呼ぶ。実行中判定は `state.json` の `invocation` を材料にする。設定は `nuxt.config.ts` を直接 import して得る（Nitro の外なので `useRuntimeConfig()` は使えない）。

## 実行の記録（`invocation`）

`state.json` が4値で持つ。書き込みは A8（`POST /api/strokes/:id/submission`）を通し、書くのは
invoke-agent だけである。claude（エージェント）と画面からは書けない。値の遷移・作業が行われた
かの判定・完成の記録との関係は [invoke-agent.md](./invoke-agent.md)「実行の記録」「作業が行われた
かの判定」。

## 実測で確定していること

Claude Code 2.1.236 / openspec 1.9.0 で確認し、1.10.0 で以下を再確認・追加した。

- **schema.yaml は全 artifact に `template` が必須**。省くと `openspec instructions` が落ちる。`templates/<file>` の実体も要る。`apply:` ノードは省略できる
- `openspec init --tools none` の生成物は `openspec/{config.yaml, changes/archive, specs}` のみ（AI ツール連携ファイルは作られない）
- `config.yaml` に `schema:` を書けば、`openspec new change` は `--schema` 無しでそのスキーマを既定に使う（1.10.0 で `flontier-strokeflow` にて再確認）
- **schema の解決元は project（cwd から解決した root）・user（`~/.local/share/openspec/schemas/`）・package（CLI 内蔵）の3系統**。user レベルは cwd にも root にも依存せず効く
- **`--store` 指定時は cwd 側（project）の schema が解決候補から除外される**。schema を store と cwd に分けて持つ構成は成立しない
- `flontier-strokeflow` の `applyRequires` は `["stroke","proposal"]`（`apply:` ノード無しでも空にならない）
- 登録簿に別ワークツリーを指す登録が残っていても、`--store` を使わない実行は登録簿を参照しない

下の3件は claude 側の性質として確かめた事実だが、**いまの配線では使っていない**（`--add-dir` を渡さず、ロードされるスキルが0本のため）。案内を Skill として配り直すときに効いてくる。

- `--add-dir` を複数渡すと、それぞれの `.claude/` からスキルもコマンドも読まれる
- `--session-id` で自前採番した uuid は、スキル内の `${CLAUDE_SESSION_ID}` と一致する
- spawn 時の環境変数はスキルの `!` フェンス事前実行まで届く

## 定義を変えるとき

`~/.local/share/openspec/schemas/flontier-strokeflow/` を編集するだけでよい。サーバは定義を読まずキャッシュも持たないため、**起動済みの呼び出しには影響せず、次回の呼び出しから反映される**。

新しいマシンで動かすには、このスキーマを `~/.local/share/openspec/schemas/` に配置する（`README.md`）。無いままセッションを作ると、claude が指示を取得できず呼び出しが失敗する。
