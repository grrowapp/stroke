# アーキテクチャ

stroke-board が**どう組まれているか**を示す資料。

- 用語の定義は `CONTEXT.md`（未作成）、決定の理由は `docs/adr/`、これから作るものは `openspec/changes/` にある。ここには書かない
- モジュール1つ1つの責務は、各ソースの冒頭コメントが持つ。ここが持つのは層の積み方・依存の向き・層をまたぐ流れ
- 記述はすべて実装から確認できる事実に限る（`openspec/changes/document-app-structure`）
- 仕様書の画面1本ぶんの流れ（本家との対比つき）は `docs/spec-screen-flow.md` にある
- 拡張 artifact の検討（未決定）は `docs/artifact-extension-plan.md` にある
- コンポーネント個別の props と参照元は `docs/file-component.md` にある
- composable 個別の公開 API と参照元は `docs/file-composables.md` にある

---

## 1. このシステムは何をするか

stroke-board は **spec-workflow-mcp（以下「本家」）を監視する外部のダッシュボード**である。複数のプロジェクトで動いている本家に接続し、起きた変化を通知として1箇所に集め、対象のドキュメントを開かせる。

本家とは別のアプリケーションで、**本家のコードには変更を加えない**。本家への書き込みは、承認への応答と、仕様書・ステアリングの文書の保存の3種だけに限る。いずれも本家の API を呼ぶだけで、stroke-board が `.spec-workflow/` へ直接書くことはない。

---

## 2. 層

5つの層で組む。上から下へ依存し、逆流しない。

| 層 | 位置 | 責任 |
| --- | --- | --- |
| **画面層** | `app/` | 受け取った形を出すだけ。判断しない |
| **API 層** | `server/api/`, `server/routes/` | 画面とサーバー内部をつなぐ口 |
| **制御層** | `server/utils/control/` | stroke-board 固有の判断はすべてここ |
| **接点層** | `server/utils/upstream/` | 本家に触る唯一の場所。本家の形をそのまま扱う |
| **共有型** | `shared/types.ts` | 画面とサーバーが共有する形 |

### 層をまたぐ境界

守られている制約は3つ。いずれも実装で確認できる。

1. **ブラウザから本家へ直接触らない。** 本家 REST も本家 WebSocket も、触るのは Nitro（サーバー）だけ。ブラウザが話す相手は stroke-board のサーバーに限られる
2. **本家の形を画面へ流さない。** 画面が見るのは `shared/types.ts` の形だけ。本家のペイロード型（`server/utils/upstream/schema.ts`）は制御層から外へ出ない
3. **接点層は制御層を知らない。** `server/utils/upstream/**` は `control/` を1度も import していない。依存は制御層 → 接点層の一方向

---

## 3. ディレクトリ

```
.
├── app/                      画面層（Nuxt 4）
│   ├── app.vue               Toaster を常設する最外殻
│   ├── layouts/              階層のシェル。ここが上層と下層を分ける
│   │   ├── portal.vue        上層 — 横タブ
│   │   └── workspace.vue     下層 — 左サイドバー + プロジェクト名
│   ├── pages/                12ページ（上層 2 / 下層 10）
│   ├── components/
│   │   ├── shared/           階層をまたぐ部品
│   │   └── workspace/        下層専用の部品
│   ├── composables/
│   │   ├── shared/           階層をまたぐ
│   │   └── workspace/        下層専用
│   └── assets/css/main.css   design token（本家から取った値／既定はダーク）
│
├── server/                   Nitro
│   ├── api/                  画面向け REST（11本／うち書き込み3本）
│   ├── routes/ws.ts          ブラウザ向け WebSocket（通知の配信のみ）
│   ├── plugins/upstream.ts   起動時に接続を張り、アクティブ集合に追従させる
│   └── utils/
│       ├── config.ts         本家に触るのに要る3つの設定を読む唯一の場所
│       ├── control/          制御層
│       └── upstream/         接点層
│
├── shared/types.ts           画面とサーバーの共有型
├── e2e/                      Playwright（142 ケース）
├── docs/adr/                 決定の記録
├── openspec/                 change と spec
└── CLAUDE.md                 エージェント向けの入口
```

### `app/components/portal/` は存在しない

上層はページを2つ持つのみで、専用のコンポーネントを1つも持たない。**欠落ではなく、上層が薄いという実態の反映**である。上層専用の部品が初めて生まれたとき、そのとき初めて作る（`openspec/changes/restructure-app-directories`）。

---

## 4. 画面の2階層

画面は上層と下層に分かれる。**シェルの形そのものを変える**ことで、どちらにいるかが見て分かる。

| | 上層（ポータル） | 下層（ワークスペース） |
| --- | --- | --- |
| URL | `/`, `/projects` | `/projects/:projectId/**` |
| レイアウト | `portal.vue` | `workspace.vue` |
| 形 | 横タブ | 左サイドバー 170px |
| 単位 | プロジェクト横断 | プロジェクト単位 |
| ページ数 | 2 | 10 |

**上層 2ページ** — 通知一覧（`/`）、プロジェクト一覧（`/projects`）

**下層 10ページ** — 概要、仕様書（一覧 / 仕様書ごと / 文書）、ステアリング（一覧 / 文書）、タスク（一覧 / 仕様書ごと）、承認（一覧 / 承認依頼ごと）

### 階層のあいだの移動

- 下層 → 上層: ヘッダーの「ポータルへ戻る」1本のみ
- 上層 → 下層: プロジェクト一覧、または通知行から直接
- **下層から別プロジェクトの下層へは直接移れない。** 切り替えの口を下層に置かず、必ず上層を経由する（`openspec/changes/implement-portal-mvp/specs/project-workspace`）

### モジュールをどこに置くか

置き場所は**実際に参照しているファイルの範囲**で決まる。役割や名前では決めない。

- 単一の階層からのみ参照される → その階層のディレクトリ（`workspace/`）
- 複数の階層から参照される → `shared/`

参照範囲が変わったら移す。規約は `openspec/changes/restructure-app-directories/specs/app-structure/spec.md`。

現在の中身:

| ディレクトリ | 中身 |
| --- | --- |
| `components/shared/` | `SbIcon`（prototype 由来のアイコン）、`UpstreamIcon`（本家由来のアイコン）、`NotificationToaster` |
| `components/workspace/` | `WorkspacePanel`（画面の外枠）、`RecordList`（一覧）、`DocumentView`（本文）、`ApprovalCard`（承認1件）、`EmptyState`、`MarkdownNodes` |
| `composables/shared/` | `useBoardSocket`（通知の受信）、`useRelativeTime` |
| `composables/workspace/` | `useProjectApi`（下層が本家の情報を取る唯一の口）、`useSteeringDocuments` |

アイコンが2つに分かれているのは、prototype 由来と本家由来を混ぜると、どちらの出どころに合わせているかが後から分からなくなるため。

---

## 5. 接点層 — 本家に触る

`server/utils/upstream/`。本家の形をそのまま扱う唯一の場所。

| モジュール | 役割 |
| --- | --- |
| `scan.ts` | 親パスの直下を走査し、`.spec-workflow` を持つディレクトリを**監視対象の母集合**にする |
| `registry.ts` | 本家の `activeProjects.json` を読み、どれがアクティブかを知る |
| `rest.ts` | 本家 REST のクライアント |
| `socket.ts` | 本家 WebSocket のクライアント。アクティブなプロジェクト1つにつき1本 |
| `schema.ts` | 本家から受け取るペイロードの形（zod） |

### 母集合を API から作らない

本家 API はプロジェクト一覧の母集合にできない。本家の `cleanupStaleProjects()` が、生きた instance の無いエントリを registry ごと削除するため、**停止中のプロジェクトを知る手段が無い**。そこで親パスの走査を母集合とし、registry は「アクティブかどうか」の判定にだけ使う（`docs/adr/0006`）。

走査対象は**読み取りのみ**で扱う。プロジェクトのディレクトリにも `.spec-workflow/` にも書き込まない。

### 書き込みは3本だけ

`rest.ts` に置く書き込み関数は次の3本に限る。

- `respondToApproval` — `POST /approvals/:id/:action`
- `saveSpecDocument` — `PUT /specs/:name/:document`
- `saveSteeringDocument` — `PUT /steering/:name`

本家にはタスクの状態更新・プロジェクトの登録と解除・アーカイブ・スナップショットも実在するが、**呼べる関数が無ければ上位から誤って呼ばれない**。`read-only.test.ts` が公開メソッドの一覧と使用する HTTP メソッドを固定しており、増やすときはそのテストを通らないと増やせない。

保存できる文書名も固定してある（仕様書3本 / ステアリング3本）。ステアリングは文書名がそのままファイル名になるため、ここが緩むとファイル名を指定できてしまう。

### バージョンの基準

基準は本家 **2.2.7**（`docs/adr/0008`）。ただし `blocked` まわりの3フィールドだけ optional にしてある。稼働環境が 2.2.5 で `blocked` を持たないため、必須にすると1件も通らず、逆に 2.2.5 の形しか許さないと本家を上げた瞬間に全部弾くことになる。

---

## 6. 制御層 — 判断する

`server/utils/control/`。**stroke-board 固有の判断はすべてここに集まる。画面は判断せず、ここが整えた形だけを見る。**

| モジュール | 役割 |
| --- | --- |
| `monitor.ts` | アクティブ集合に追従して本家への接続を張り替える |
| `diff.ts` | 受け取ったスナップショットを前回値と比べ、通知にすべき変化を取り出す |
| `notify.ts` | 差分を通知にする。飛び先を決める |
| `board.ts` | ブラウザへ通知を配信するハブ |
| `directory.ts` | 走査結果と registry を突き合わせ、上層のプロジェクト一覧を作る |
| `actions.ts` | 一覧画面の操作（登録・作成）が使えるかどうか |
| `upstream-proxy.ts` | 下層の画面が要る読み取りと保存を本家との間で仲介する |

### 差分の判定が必要な理由

本家のイベントは**すべてスナップショット型**で「何が起きたか」を含まない。本家サーバーは `tasks.md` を毎回パースして今の `taskList` を送るだけで、前回値を持たない。したがって比較は受け取った側の仕事になる。

### 突き合わせのキー

`directory.ts` が走査結果と registry を突き合わせるキーは **`workflowRootPath`**。registry の `projectId` は `projectPath`（workspace のパス）の SHA-1 から作られるため、走査で見つかる `.spec-workflow` を持つディレクトリからは計算できない。

### 通知の飛び先

飛び先は**種別だけ**で決まる。

- 承認依頼 → 承認画面。`category` が `spec` でも `steering` でも変わらない（`docs/adr/0007`）
- タスクの3種 → タスク画面

### 登録・作成が使えない理由は2つある

`actions.ts` が「使えない」を返す理由は、登録と作成で異なる。作成は実処理を担うのが接続先の別プロジェクトで、stroke-board は入口だけを持つ。どちらも MVP では**非活性の入口だけ**を置いており、中身は未実装（`openspec/changes/implement-portal-mvp`）。

---

## 7. API 層

### `server/api/` — 画面向け REST（11本）

| エンドポイント | 用途 |
| --- | --- |
| `GET /api/projects` | 上層のプロジェクト一覧 |
| `GET /api/projects/:id/info` | 下層のプロジェクト概要 |
| `GET /api/projects/:id/specs` | 仕様書の一覧 |
| `GET /api/projects/:id/specs/:spec/documents` | 仕様書の文書 |
| `GET /api/projects/:id/specs/:spec/tasks` | タスク |
| `GET /api/projects/:id/steering/:name` | ステアリング文書 |
| `GET /api/projects/:id/approvals` | 承認依頼の一覧 |
| `GET /api/projects/:id/approvals/:aid/content` | 承認対象の本文 |
| `POST /api/projects/:id/approvals/:aid/:action` | 承認 / 却下（**書き込み**） |
| `PUT /api/projects/:id/specs/:spec/:document` | 仕様書の文書の保存（**書き込み**） |
| `PUT /api/projects/:id/steering/:name` | ステアリング文書の保存（**書き込み**） |

**書き込みはこの3本だけ。** 接点層（`upstream/rest.ts`）にもこの3本ぶんの関数しか置いておらず、`read-only.test.ts` が範囲を機械的に固定している。増やすときはそのテストを通らないと増やせない。

保存できる文書名は6つに固定されている（仕様書 requirements / design / tasks、ステアリング product / tech / structure）。本家も同じ値で弾くが、退けられた理由を stroke-board の言葉で返すためにこちらでも弾く。

下層向けの10本はすべて `control/upstream-proxy.ts` を経由する。ブラウザから本家へ触らせないための唯一の経路。

上層向けの `GET /api/projects` だけは経路が違い、`scan` / `registry` / `directory` / `actions` を組み合わせて一覧を組み立てる。本家が動いていなくても母集合が出るのはこのため。

### `server/routes/ws.ts` — ブラウザ向け WebSocket

通知の配信だけを担う。ブラウザはここに繋ぐ。本家 WebSocket には繋がない。

---

## 8. 通知が画面に出るまで

本家で起きた変化が画面に届く経路。

```
本家 (spec-workflow-mcp)
  │  WebSocket（プロジェクトごとに1本／スナップショット）
  ▼
upstream/socket.ts ──── upstream/schema.ts で形を検証
  ▼
control/monitor.ts ──── アクティブ集合に追従して接続を張り替える
  ▼
control/diff.ts ─────── 前回値と比較して変化を取り出す
  ▼
control/notify.ts ───── 通知にする（飛び先を決める）
  ▼
control/board.ts ────── 配信ハブ
  ▼
routes/ws.ts ────────── ブラウザ向け WebSocket
  ▼
composables/shared/useBoardSocket.ts
  ▼
├── components/shared/NotificationToaster.vue   トースト（app.vue に常設）
└── pages/index.vue                             通知一覧
```

**トーストからは対象へ進めない。** 押しても何も起きず、5秒で自動消滅する。対象を開く導線は通知一覧に一本化してある。

### 下層の読み取りは別経路

通知とは経路が分かれる。

```
下層のページ
  ▼
composables/workspace/useProjectApi.ts   下層が本家の情報を取る唯一の口
  ▼
server/api/projects/:id/**
  ▼
control/upstream-proxy.ts                ブラウザから本家への唯一の経路
  ▼
upstream/rest.ts
  ▼
本家 REST
```

`useProjectApi` に集約しているのは、画面ごとに `useFetch` の URL を書くとエンドポイントの形が画面の数だけ散るため。本家の形が変わったときに直す場所が1つで済む。

---

## 9. 起動と接続

`server/plugins/upstream.ts` が起動時に接続を張り、アクティブ集合の変化に追従させる。

**本家は利用者が別途起動する前提**なので、本家が動いていない状態から始まるのが普通である。繋がらなくても stroke-board は動き続ける。

接続状態は画面の右上に dot で出る（上層・下層とも）。下層では本家から解決できないプロジェクトを「未接続」として示し、ポータルから選び直させる。

### 設定

設定はすべて環境変数から入る。読む場所は `server/utils/config.ts` の1箇所だけで、ソースに埋めない。設定画面は持たない（環境変数から読むため、MVP の時点で設定画面に出すものが無い）。

本家に触るのに要るのは3つ。

| キー | 環境変数 | 用途 |
| --- | --- | --- |
| `upstreamBaseUrl` | `NUXT_UPSTREAM_BASE_URL` | 本家ダッシュボードの URL |
| `projectsParentPath` | `NUXT_PROJECTS_PARENT_PATH` | `.spec-workflow` を持つディレクトリを探す親パス |
| `specWorkflowHome` | `NUXT_SPEC_WORKFLOW_HOME` | 本家のグローバル状態（`activeProjects.json`）の置き場 |

前2つは未設定なら `null` になる。`specWorkflowHome` だけは既定値（本家の `DEFAULT_DIR_NAME` に合わせた `.spec-workflow-mcp`）に落ちるため `null` にならない。本家と同じ場所を指していないとアクティブ判定ができないため、解決規則も本家に揃えてある。

このほかにアクティブ集合を見直す間隔（`syncIntervalMs`）を持つ。

---

## 10. 規約

### auto-import を使わない

`nuxt.config.ts` で `imports: { autoImport: false }` と `components: { dirs: [] }` を設定している。composable も util も `#imports` または `~/...` から**明示的に import する**。

この結果、参照関係が grep で機械的に追える。ディレクトリの移動が Nuxt の名前解決に影響しないのもこのため。

### テスト

| コマンド | 対象 | 件数 |
| --- | --- | --- |
| `yarn test` | vitest — 制御層・接点層のユニット | 106 |
| `yarn test:e2e` | Playwright — 画面（本家はスタブ） | 129 |
| `yarn test:live` | 実際に動いている本家に当てる | 別実行 |
| `yarn typecheck` | `nuxt typecheck` | — |

E2E は `e2e/fixtures/upstream-stub.mjs` が本家を差し替える。`*.live.test.ts` だけは実物の本家に当たるため、通常の `yarn test` には含まれない。

### 画面は判断しない

判断は制御層に集める。画面は `shared/types.ts` の形を出すだけで、本家の形を知らない。

---

## 11. 参照

| 資料 | 持つもの |
| --- | --- |
| `CONTEXT.md` | ドメイン用語の定義（未作成） |
| `docs/adr/0005` | 本家データから派生させない |
| `docs/adr/0006` | 本家の観測された挙動 |
| `docs/adr/0007` | 承認の category と飛び先 |
| `docs/adr/0008` | 基準は 2.2.7 |
| `openspec/changes/implement-portal-mvp` | MVP の範囲と画面の要件 |
| `openspec/changes/restructure-app-directories` | 配置の規約 |
| `openspec/changes/document-app-structure` | この資料の要件 |
| `docs/agents/` | エージェント向けの運用（issue / triage / domain） |
