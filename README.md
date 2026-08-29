# stroke-board

1つの流れの前半と後半を1つの Nuxt アプリで持つ。

- **ストローク（前半）** — Web 上でユーザーと AI が往復しながら開発したいシステムの全体像を詰め、合意できた時点で proposal を起こし、承認されたらプロジェクトを生成する
- **ポータル（後半）** — spec-workflow-mcp のダッシュボードの上に置く、プロジェクト横断の通知ポータル。生成されたプロジェクトを見張る

```
概要を投げる ──▶ ストローク ──▶ proposal 確認 ──▶ 承認
                 (AI と往復)                        │
                                                    ▼
                                         /opt/projects/<name>/
                                           └── docs/proposal.md
                                                    │
                                                    ▼
                                       プロジェクト一覧 ──▶ 通知・承認待ち
```

統合の経緯と道筋は `docs/specs/plan/mainline-merge.md`、統合形態の決定は
`docs/adr/0002-merge-into-stroke-board.md`。用語は `CONTEXT.md`。

## ポータル

本家（spec-workflow-mcp）のダッシュボードはプロジェクト単位で、`projectId` を
`localStorage` に持ち URL に出さない。そのため「どのプロジェクトの何が起きたか」を指す
リンクが作れず、複数プロジェクトを並行して回すと、どこで承認待ちが発生したかは各プロジェクトの
ダッシュボードを順に開くまで分からない。ポータルはその上に横断の見張りを置く。

本家とは別プロセスで動き、**本家にも `.spec-workflow/` にも一切書き込まない**。

### 前提

- **本家 spec-workflow-mcp のダッシュボードが別途起動していること。** stroke-board は
  本家プロセスの起動・停止・監視に責任を持たない。起動していなければ「未接続」と表示して
  動き続ける

### 設定（ポータル側）

環境変数から読む。`.env.example` を参照。

| 環境変数 | 意味 |
|---|---|
| `NUXT_UPSTREAM_BASE_URL` | 本家ダッシュボードの URL |
| `NUXT_SPEC_WORKFLOW_HOME` | 本家のグローバル状態の置き場。`activeProjects.json` がここにある。本家の `SPEC_WORKFLOW_HOME` と同じ値を指すこと。未設定なら `~/.spec-workflow-mcp` |
| `NUXT_SYNC_INTERVAL_MS` | アクティブなプロジェクト集合を見直す間隔（ミリ秒）。既定 30000 |

走査の親パス（`.spec-workflow` を持つディレクトリを探す先。**直下1階層だけ**を走査する）は
環境変数を持たない。ストローク側の保存先と同じ1つの設定
（`nuxt.config.ts` の `projectShareRoot`）を見る。分けると食い違ったときに、承認した
プロジェクトが一覧から消えるためである。

プロジェクト一覧の母集合は親パスの走査で作る。本家 API は停止中のプロジェクトを返さないため、
API だけでは一覧が作れない（`docs/adr/0006-upstream-observed-behaviour.md`）。

### 分かっている限界

- **ステアリング文書の更新は検出できない。** 本家の payload が変化しない
- **承認と却下を区別できない。** 本家は保留中しか返さず、結果は「消滅」としてしか観測できない
- **本家がクラッシュすると誤表示になる。** 生存確認は本家ダッシュボードの起動時1回だけで、
  死んだ PID が次の起動まで「アクティブ」として残る。本家の再起動でしか解消しない
- **再起動で通知の基準が失われる。** 前回値をメモリにしか持たないため、プロセスを
  再起動すると次の変化まで通知が出ない
- **切断中に起きた変化は通知にならない。** 再接続時に基準を作り直す

### 出す通知

本家 `NotificationProvider` と同じ4種だけ。

| 通知 | 条件 | 飛び先 |
|---|---|---|
| タスク完了 | 完了数が前回値より増えた | タスク画面 |
| タスク着手 | 着手中のタスクが変わった | タスク画面 |
| 全件完了 | そのタスク一覧が全件完了になった | タスク画面 |
| 承認依頼の発生 | 保留中の承認依頼の ID が増えた | 承認画面 |

承認依頼は仕様ドキュメントにもステアリング文書にも立つ。どちらでも飛び先は承認画面で、
本家の承認画面が対象文書のレビュー面そのものだからである
（`docs/adr/0007-approval-category-and-destination.md`）。

### 本家の基準

**2.2.7**（`docs/adr/0008-baseline-is-2-2-7.md`）。依存しているのは公開 API だけでなく、
WebSocket ペイロードの形・registry の構造・PID による生存判定といった内部の振る舞いも含む。
本家に触るコードは `server/utils/upstream/` に閉じてあるので、本家が変わったときに直す
範囲はそこに限られる。

## ストローク

### 動かすまで

#### 1. 配置作業（アプリの外、`sudo` が要る）

セッションディレクトリと生成先を作り、実行ユーザーへ所有権を渡す。

```bash
sudo mkdir -p /var/lib/stroke-board/sessions
sudo chown -R "$USER":"$USER" /var/lib/stroke-board

sudo mkdir -p /opt/projects
sudo chown "$USER":"$USER" /opt/projects
```

どちらかが書き込み不可だと、起動時チェックが警告を出す（実行中に初めて気付く形にしない）。

#### 2. Claude Code CLI

実行ホストに Claude Code CLI が入っていて、`claude -p` が認証済みであること。

```bash
claude --version
```

#### 3. ワークフロースキーマの配置（user レベル）

セッションのワークフロースキーマ `flontier-strokeflow` を user レベルに置く。無いまま
セッションを作ると、claude が指示を取得できず呼び出しが失敗する。

```bash
ls ~/.local/share/openspec/schemas/flontier-strokeflow/schema.yaml
```

store（`openspec store register`）への登録は**不要**。

### 設定（ストローク側）

**設定の正は [`docs/specs/core/settings-reference.md`](docs/specs/core/settings-reference.md) である**
（[ADR 0004](docs/adr/0004-settings-reference-is-authoritative.md)）。ここに無いものは
設定ではない。**既定値の一覧を README に重ねない。**

**ストローク側は環境変数から設定を読まない。** 値は `nuxt.config.ts` の `runtimeConfig` と
`app/app.config.ts` に書かれたものだけである。`.env` はポータル側の未統合分にしか効かない。

読み手は endpoint が `useRuntimeConfig()`、CLI（`yarn session`、Nitro の外）が
`nuxt.config.ts` を直接 import する。環境変数を見ないので両者は同じ値に解決される。

保存先（`projectShareRoot`）が絶対パスでない・書き込めない場合は起動時チェックが警告を出す。

**ビルド時に決まるもの**（`modules` / `css` / `devtools` / `ignore` /
`nitro.experimental.websocket`）は環境変数で変えられない。変えるにはアプリを作り直す。
どちらなのかは `nuxt.config.ts` の見出しで分かれている。

`yarn session`（CLI）もサーバと同じ設定を読む。`.env` があれば読み込み、無ければ既定で動く。

> **注**: ポータル側の環境変数3件（上の表）はこの流儀に未統合（settings-reference に載っていない）。
> 設定運用の一本化は `align-settings-conventions` の続きで扱う。

### 画面

| ルート | 画面 |
|---|---|
| `/strokes` | 概要入力 |
| `/strokes/<uuid>` | 画面1（ストローク） |
| `/strokes/<uuid>/proposal` | 画面2（proposal 確認） |

### 置き場所

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

### セッションを畳む

- サーバが動いているとき: `GET /api/strokes` で一覧、`POST /api/strokes/<uuid>/delete` で削除
- サーバが動いていないとき:

```bash
yarn session list
yarn session delete <uuid>
yarn session create "<概要>"
```

どちらも同じ実体（`server/utils/stroke/session-core.ts`）を呼ぶ。手順の詳細は
`docs/specs/architecture/session-workflow.md`。

## 前提（共通）

- Node.js `^22.19.0 || ^24.11.0 || >=26.0.0`
- yarn 4

## 起動

```sh
yarn install --immutable
yarn build
node .output/server/index.mjs
```

開発時は `yarn dev`。

## テスト

| コマンド | 内容 | 本家の起動 |
|---|---|---|
| `yarn typecheck` | `vue-tsc` による型チェック | 不要 |
| `yarn test` | ユニットテスト（vitest） | 不要 |
| `yarn test:e2e` | E2E（Playwright）。本家スタブを自動で立てる | 不要 |
| `yarn test:live` | 稼働中の本家に実接続して形を確かめる | **必要** |

`yarn test:live` は `NUXT_UPSTREAM_BASE_URL`（既定 `http://127.0.0.1:5000`）が指す本家に
実際に繋ぐ。本家が動いていない環境で落ちても stroke-board の不具合ではないので、通常の
`yarn test` からは外してある。

E2E は本物の本家を使わない。承認依頼やタスクの状態を動かすには本家へ書き込む必要があるが、
stroke-board はその線を越えないと決めている（`docs/adr/0005-do-not-derive-from-upstream-data.md`）。
代わりに実測した形と同じペイロードを返すスタブ（`e2e/fixtures/upstream-stub.mjs`）を使い、
スタブが実物とずれていないことを `yarn test:live` が本物に対して確かめる。
