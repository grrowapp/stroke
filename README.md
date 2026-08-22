# stroke-board-frontier

Web 上でユーザーと AI が往復しながら、開発したいシステムの全体像を詰め、合意できた時点で proposal を起こし、承認されたらプロジェクトを生成するシステム。`stroke-board` の MVP。

用語は `CONTEXT.md`、決定の記録は `docs/adr/` と `openspec/changes/build-mvp/design.md` を参照。

## 動かすまで

### 1. 配置作業（アプリの外、`sudo` が要る）

セッションディレクトリと生成先を作り、実行ユーザーへ所有権を渡す。

```bash
sudo mkdir -p /var/lib/stroke-board/sessions
sudo chown -R "$USER":"$USER" /var/lib/stroke-board

sudo mkdir -p /opt/projects
sudo chown "$USER":"$USER" /opt/projects
```

どちらかが書き込み不可だと、アプリは**起動時に失敗する**（実行中に初めて気付く形にしない）。

### 2. Claude Code CLI

実行ホストに Claude Code CLI が入っていて、`claude -p` が認証済みであること。

```bash
claude --version
```

### 3. ワークフロースキーマの配置（user レベル）

セッションのワークフロースキーマ `flontier-strokeflow` を user レベルに置く。無いままセッションを作ると、claude が指示を取得できず呼び出しが失敗する。

```bash
ls ~/.local/share/openspec/schemas/flontier-strokeflow/schema.yaml
```

store（`openspec store register`）への登録は**不要**。

### 4. 起動

```bash
yarn install
yarn dev
```

## 設定

AI の起動設定は `nuxt.config.ts` の `runtimeConfig.claude` にある。再ビルドせずに環境変数で上書きできる。

| 環境変数 | 既定 | 意味 |
|---|---|---|
| `NUXT_CLAUDE_SETTING_SOURCES` | `project` | `claude -p` の `--setting-sources`。**`project` を外すとスキルが一切ロードされない**（ADR 0001） |
| `NUXT_CLAUDE_ADD_DIR` | このリポジトリのパス | `--add-dir`。`grilling` と `domain-modeling` を持つリポジトリのルートを渡す |
| `NUXT_CLAUDE_ALLOWED_TOOLS` | `Write Edit`（**暫定**） | `--allowedTools`。これが無いと AI が `proposal.md` を書けず把握完了が起きないため MVP を動かす目的で渡している。中身は未決 |
| `NUXT_CLAUDE_TIMEOUT_MS` | `180000` | 子プロセスのタイムアウト。超えたらリトライへ |
| `NUXT_CLAUDE_WORKFLOW_SCHEMA` | `flontier-strokeflow` | セッションの `openspec/config.yaml` に書くスキーマ名（user レベル配置） |

不正な値（数値でないタイムアウトなど）は起動時に弾く。

## 画面

| ルート | 画面 |
|---|---|
| `/strokes` | 概要入力 |
| `/strokes/<uuid>` | 画面1（ストローク） |
| `/strokes/<uuid>/proposal` | 画面2（proposal 確認） |

## 置き場所

```
/var/lib/stroke-board/sessions/<uuid>/
├── openspec/       セッションの openspec ルート（change は changes/draft-proposal/）
├── state.json      局面（phase / projectName / 未回答の問い）
├── strokes.json    済んだストローク（問いと回答のペア）。パンくずの元
└── proposal.md     最新の proposal。AI が書く

/opt/projects/<name>/
└── docs/proposal.md   承認された proposal
```

セッションに属するものはセッションディレクトリ1箇所に収まる。自動では消えない。

## セッションを畳む

- サーバが動いているとき: `GET /api/strokes` で一覧、`POST /api/strokes/<uuid>/delete` で削除
- サーバが動いていないとき:

```bash
yarn session list
yarn session delete <uuid>
yarn session create "<概要>"
```

どちらも同じ実体（`server/utils/stroke/session-core.ts`）を呼ぶ。手順の詳細は `docs/session-workflow.md`。
