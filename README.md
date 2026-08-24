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

**設定の正は [`docs/settings-reference.md`](docs/settings-reference.md) である**（[ADR 0004](docs/adr/0004-settings-reference-is-authoritative.md)）。ここに無いものは設定ではない。**既定値の一覧を README に重ねない。**

**`.env` で差し替えられるのは置き場の2件だけ**（`NUXT_SESSIONS_ROOT` / `NUXT_PROJECTS_ROOT`）。動かす機械ごとに変わるためである。他の設定は機械が変わっても変わらないので、`nuxt.config.ts` に書かれた値だけを使う。

```bash
cp .env.example .env   # 変えたい行のコメントを外す
```

置き場が絶対パスでなければ**起動時に弾く**。どちらが不正かは起動時のメッセージに出る。

**ビルド時に決まるもの**（`modules` / `css` / `devtools` / `ignore` / `nitro.experimental.websocket`）は環境変数で変えられない。変えるにはアプリを作り直す。どちらなのかは `nuxt.config.ts` の見出しで分かれている。

`yarn session`（CLI）もサーバと同じ設定を読む。`.env` があれば読み込み、無ければ既定で動く。

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
