# 構造

stroke-board の構造の定義。**統合後のあるべき配置**を規範として定める。

**構造の正はこの文書である。** `openspec/specs/app-structure` は、ここから導かれる要件を検査できる形（Requirement + Scenario）に言い換えたもので、区切りの名前は持たない（持つのは「実際の参照範囲で決める」という判定だけ）。食い違ったらこの文書が勝つ。

**この文書が定めるのは到達点である。** 現状との差は移行課題として `docs/specs/plan/structure-migration.md` が持つ。差があること自体は違反ではなく、到達点へ動かす作業が spec に反することもない。

構造（置き場）に触るときは、**規範（この文書）→ 物差し（`openspec/specs/app-structure`）→ 移行課題（`structure-migration.md`）** の順に読む。

- 用語は `CONTEXT.md`、決定の理由は `docs/adr/`、api の契約は `docs/specs/api/contract.md`
- components の全数と規範への対応は `docs/specs/structure/file-components.md`、composables は `docs/specs/structure/file-composables.md`、server/utils は `docs/specs/structure/server-structure.md`。`modules/` は画面の部品ではないので、これらの棚卸しに含めない（§3）
- データ取得・SSR の設計は `docs/specs/architecture/data-fetching.md`
- 現状との差分（移行課題）は `docs/specs/plan/structure-migration.md`
- コーディング規約（命名・import の書き方・テストの置き場・通す門番・書き方の原則）は steering（`.spec-workflow/steering/` の `structure.md` / `tech.md`）が持つ。この資料は規約を持たず、参照だけを置く

---

## 1. ディレクトリ構造

```
base2/
├── app/                        画面（Nuxt 4）
│   ├── app.vue                 アプリの殻（1つ）
│   ├── assets/css/             スタイル
│   ├── layouts/                シェル（形が変わる単位で1枚）
│   ├── pages/                  ルーティングのみ。実体は持たない（`page-structure.md`）
│   │   ├── index.vue           通知
│   │   ├── projects/
│   │   │   ├── index.vue       list（プロジェクト一覧）
│   │   │   └── [projectId]/    detail（specs / steering / tasks / approvals）
│   │   └── strokes/            セッション（概要入力 → proposal 確認）
│   ├── components/             画面の実体はここが主体。page ＋ ui ＋ 機能単位（到達点。現状との差は移行課題）
│   │   ├── page/               Route に対応するページの実装（`<PageName>/<PageType>/Container.vue`。`page-component-structure.md`）
│   │   ├── ui/                 機能に属さない共通部品
│   │   ├── notification/       通知
│   │   ├── project/            プロジェクト（一覧・登録・作成の入口）
│   │   ├── question/           問いの往復
│   │   ├── proposal/           proposal 確認・差し戻し・注釈
│   │   └── approval/           承認
│   └── composables/            関心単位の useXxx を平置き。境界のディレクトリを作らない
├── modules/                    画面の階層に属さない自己完結の機能（Nuxt module。機能ごとに1つ。§3）
│   └── markdown/               markdown を描く・直す・位置を出す。外から引く公開インターフェースは `#markdown` の1本
├── server/                     Nitro
│   ├── api/                    契約どおり（strokes は contract.md、projects は本家仲介）。ファイルの置き方は `docs/specs/api/server.md`
│   ├── plugins/                起動時処理
│   ├── routes/                 WebSocket（ws.ts と api/sessions/:id/ws/** = 契約 W1・W2）
│   └── utils/                  関心単位で切る（§4 に一覧）
├── shared/                     画面とサーバーが共有する型（ドメイン別ファイル）
├── docs/                       specs（定義）/ adr / agents
├── test/                       テスト（単体は app/ modules/ server/ shared/ を写す。e2e/ は Playwright）
├── openspec/                   機能的 specs と change
└── scripts/
```

---

## 2. 画面 — `app/`

- **pages はただのルーティング。** ページは薄く保ち、画面の実体は components が持つ
- **components は `page/` ＋ `ui/` ＋ 機能単位で切る。** Route に対応するページの実装は `page/<PageName>/<PageType>/Container.vue`（`page-component-structure.md`）、機能に属さない共通部品は `ui/`、機能の部品は機能のディレクトリ（notification / project / question / proposal / approval）。出自や画面グループの境界では切らない。部品が無い機能のディレクトリは作らない。全数の対応は `file-components.md`
  - **これは到達点である。** 現状は直下 ＋ `project/` `prototype/` `review/` `shared/` `stroke/` `workspace/` で、`ui/` ＋ 機能単位へ移す作業は `structure-migration.md` が移行課題として持つ
  - どの区切りに置くかは**実際の参照範囲**で決める。役割・名前・将来の想定で決めない。判定の物差しは `openspec/specs/app-structure`
  - markdown を描く・直す部品は components ではなく `modules/markdown/` にある（§3）。`app/components/` に同じ実体を重ねて持たない
- **composables は関心単位の `useXxx` を平置き**にする。境界のディレクトリを作らない。全数の対応は `file-composables.md`
- **テストは `test/` の下に置く。** 単体は `app/` `modules/` `server/` `shared/` の構造をそのまま写し、E2E は `test/e2e/`（`playwright.config.ts` の `testDir` がここを指す）
- レイアウトはシェルの形が変わる単位で持つ（横タブの `portal.vue` / 左サイドバーの `workspace.vue`）。プロジェクト間の移動は一覧を経由する
- セッションへの入口はプロジェクト一覧の **作成** で、専用のトップページを持たない
- データ取得の設計は `docs/specs/architecture/data-fetching.md`

---

## 3. モジュール — `modules/`

画面の階層（上層ポータル / 下層ワークスペース）に属さず、それ自体で完結する機能の置き場。Nuxt 4 が自動で読む `modules/` をそのまま使い、`nuxt.config.ts` に列挙しない。機能ごとに1ディレクトリを切る。

- **置いてよいものの判定は `openspec/specs/app-structure`「画面の階層に属さない機能は `modules/` に置く」が持つ**（階層に依存しない／外へ公開するインターフェースが定まっている／内側を変えてもインターフェースが同じなら外は変わらない）。この文書はそれを繰り返さない
- **外から引くのは公開インターフェースだけ。** 内側のファイルを直接指す import を書かない。`modules/` に置いたものの実体を `app/` の側に重複して持たない
- **モジュールは画面の部品ではない。** `app/components/` の棚卸し（`file-components.md`）と `app/composables/` の棚卸し（`file-composables.md`）の対象外で、全数はこの節で数える
- **モジュールの側は app の部品を参照しない。** 中身が無いときに何を出すかのように app の事情に属することは、slot で呼ぶ側が渡す
- **テストは `test/modules/<機能名>/` に写す**（§2 のテストの規則と同じ）
- 名前を選べない段が1つある。**server 側のコードは必ず `runtime/server/` に置く**（Nuxt が生成する tsconfig がこの名前を server 文脈へ入れる。別名にすると browser 側の型で検査される）

現在あるのは1つ。

| モジュール | 公開インターフェース | 中身の切り方 |
| --- | --- | --- |
| `markdown/` | `#markdown`（alias。`#markdown/render/MarkdownView.vue` のように alias で引く） | `runtime/` を**提供する機能で切る** — `render/`（描く）/ `edit/`（直す）/ `position/`（位置を出す）/ `assets/`（見た目）。`components/` `composables/` のような種類では切らない。振る舞いの規定は `openspec/specs/markdown/module`、置き方の理由は `modules/markdown/index.ts` の冒頭コメント |

`markdown/` の中身（2026-09-01 時点。全数は `find modules/markdown -type f` で確かめる）。

| 置き場 | ファイル | 何をするか |
| --- | --- | --- |
| `index.ts` | — | `@nuxtjs/mdc` の導入と設定（**markdown の設定はここにだけ在る。** `nuxt.config.ts` に戻さない）、`MarkdownFence` の global 登録（`addComponent({ global: true })`。`mdc.components.map` が名前で引くため）、`markdown.css` の追加 |
| `runtime/render/` | `MarkdownView.vue` / `MarkdownSource.vue` / `MarkdownFence.vue` / `MarkdownCode.vue` / `MarkdownDiagram.vue` / `source-shown.ts` | 整形して描く面 / 生テキストの面 / フェンスの振り分け / コードブロック / mermaid の図（`v-html` はここにだけ在る）/ ソースを見せる範囲の受け渡し |
| `runtime/edit/` | `MarkdownEditor.vue` | 直して保存する面。保存そのものは呼ぶ側が渡す |
| `runtime/position/` | `plain.ts` / `preview.ts` / `fence.ts` / `normalize.ts` / `source-span.ts` / `types.ts` | 描かれた範囲 ↔ 生テキストの位置の対応 |
| `runtime/assets/` | `markdown.css` | 本文の見た目 |

使う側は `app/` の5箇所 — `pages/projects/[projectId]/` の specs / steering / approvals の3画面、`pages/strokes/[sessionId]/proposal.vue`、`components/review/ApprovalAnnotator.vue`（`pages/…` は現状。到達点では `components/page/` の Container.vue が引く）。いずれも `#markdown/render/MarkdownView.vue` か `#markdown/edit/MarkdownEditor.vue` を明示 import で引く。

---

## 4. サーバー — `server/`

**api は契約が正。** ファイルの置き方（Endpoint はディレクトリ、Method は `index.<method>.ts`）は `docs/specs/api/server.md`。セッション系（`/api/sessions/**`、WS を含む）は `docs/specs/api/contract.md` の番号どおり。**エージェントが叩く endpoint は `/api/strokes/**` に分かれている**（`docs/specs/api/overview.md` の `strokes/` 5本）。プロジェクト系（`/api/projects/**`）は本家の読み取り10本と書き込み3本（承認応答・仕様書保存・ステアリング保存）で、`read-only.test.ts` が範囲を機械的に固定している。

**utils は関心単位で切る。** 区分は4つ — **本家接続 / 監視・通知 / セッション / 設定・起動**。全数の対応は `server-structure.md`。

守る制約は3つ。

1. **ブラウザから本家へ直接触らない。** 本家 REST も本家 WebSocket も、触るのは Nitro（サーバー）だけ
2. **本家の形を画面へ流さない。** 画面が見るのは `shared/` の形だけ。本家のペイロード型（`schema`）は utils の外へ出ない
3. **本家に触るモジュールは他の utils を知らない。** 依存は 画面 → api → utils → 本家接続 の一方向

`server/plugins/` はアプリ全体の起動時処理だけを持つ。本家は利用者が別途起動する前提で、繋がらなくても stroke-board は動き続ける。設定の正は `docs/specs/core/settings-reference.md`。ここに無いものは設定ではない（`docs/adr/0004`）。

---

## 5. 共有型 — `shared/`

画面とサーバーが共有する型。1つの型空間をドメイン別ファイルで持つ（1往復そのものは `Stroke` 型）。本家のペイロード型はここに置かず、本家接続のモジュールに閉じる。

---

## 6. 参照

| 資料 | 持つもの |
| --- | --- |
| `openspec/specs/app-structure` | 置き場の判定の物差し（この文書から導かれる。食い違ったらこの文書が勝つ） |
| `openspec/specs/markdown/module` | markdown モジュールの振る舞いの規定 |
| `docs/specs/api/contract.md` | api の契約 |
| `docs/specs/api/server.md` | `server/api/` のファイルの置き方 |
| `docs/specs/structure/page-structure.md` / `page-component-structure.md` | `pages/` と `components/page/` の対応と構造 |
| `docs/specs/core/schema.md` | 入れ物の形と検証 |
| `docs/specs/core/settings-reference.md` | 設定の正 |
| `docs/specs/structure/file-components.md` / `file-composables.md` / `server-structure.md` | 部品・composable・utils の全数と規範への対応（`modules/` は含まない。§3） |
| `docs/specs/architecture/data-fetching.md` | データ取得・SSR の設計 |
| `docs/specs/plan/structure-migration.md` | 現状との差分（移行課題） |
| `.spec-workflow/steering/structure.md` / `tech.md` | コーディング規約（命名・import・テストの置き場・通す門番・書き方の原則） |
| `docs/adr/0002` / `0005`〜`0008` | 統合・本家の扱いの決定 |
| `docs/agents/` | エージェント向けの運用 |
