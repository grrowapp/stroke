# セッションのワークフロー定義

claude プロセスへの指示は、コードではなく **openspec のワークフロー定義**にある。定義ファイルを編集すれば、コード変更・再ビルド・再起動なしに次回の呼び出しから反映される（`openspec/specs/workflow-definition/spec.md`）。

経緯と却下案は `openspec/changes/archive/2026-08-20-claude-p-openspec-workflow/design.md` にある。

## 置き場

```
workflow/                                   OpenSpec ルート（store として登録）
├── .openspec-store/store.yaml              store 識別メタ
└── openspec/
    ├── config.yaml                         schema: stroke-session
    ├── schemas/stroke-session/
    │   ├── schema.yaml                     artifact は stroke → proposal の2段
    │   └── templates/{stroke,proposal}.md
    └── changes/<sessionId>/                実行時に作られる。git 管理外

assets/.claude/skills/                      セッション API スキル6本
├── get-overview/  get-strokes/  get-send-back/     取得
├── question/  proposal/                            提出
└── guidance/                                       案内
```

セッション = この store 上の change。`createSession()` が `openspec new change <sessionId> --store <id>` 相当を実行する（`server/utils/openspec.ts`）。

## 配線

| 何を | どこで | どう届くか |
|---|---|---|
| store id | `runtimeConfig.claude.storeId` | 初回 prompt の固定文に載る |
| 実行する opsx コマンド | `runtimeConfig.claude.opsxCommand` | 初回 prompt の先頭 |
| 接続先 | `runtimeConfig.claude.apiBaseUrl` | spawn 時の環境変数 `STROKE_BASEURL` |
| セッション id | — | cwd のディレクトリ名と `${CLAUDE_SESSION_ID}` |
| スキル・コマンドの置き場 | `runtimeConfig.claude.addDir` | `--add-dir`（空白区切りで複数） |

prompt に動的値は載せない。初回はコマンド実行指示のみ、2回目以降は「続きを進めろ」の固定文1本（リトライも同文）。

## 実測で確定していること

Claude Code 2.1.236 / openspec 1.9.0 で確認した。

- **schema.yaml は全 artifact に `template` が必須**。省くと `openspec instructions` が
  `artifacts.N.template: Invalid input: expected string, received undefined` で落ちる。
  `templates/<file>` の実体も要る。逆に `apply:` ノードは省略できる
- store の `config.yaml` に `schema:` を書けば、`openspec new change --store <id>` は
  `--schema` 無しでそのスキーマを既定に使う
- `--add-dir` を複数渡すと、それぞれの `.claude/` からスキルもコマンドも読まれる。
  `--add-dir` 無しでは opsx コマンドは1本も見えない
- `--session-id` で自前採番した uuid は、スキル内の `${CLAUDE_SESSION_ID}` と一致する
- spawn 時の環境変数はスキルの `!` フェンス事前実行まで届く（`$(printenv ...)` で解決）
- `.gitignore` の `.claude/` は `assets/.claude/` も食う。`!assets/.claude/` を後に置くと
  再包含され、ルートの `.claude/`（開発者個人の設定）は無視されたまま残る

## 定義を変えるとき

`workflow/openspec/schemas/stroke-session/` を編集するだけでよい。サーバは定義を読まずキャッシュも持たないため、**起動済みの呼び出しには影響せず、次回の呼び出しから反映される**。
