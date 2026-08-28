# Project Structure

## Directory Organization

Nuxt4 の規約に従い、画面は `app/`、サーバーは `server/`、両者が共有する型は `shared/` に置く。

```
base2/
├── app/
├── server/
├── shared/
├── docs/
├── e2e/
├── openspec/
├── scripts/
├── nuxt.config.ts
├── package.json
├── tsconfig.json
├── playwright.config.ts
├── vitest.config.ts
├── vitest.live.config.ts
├── yarn.lock
├── .env.example
├── CLAUDE.md
├── CONTEXT.md
└── README.md
```

詳細は `docs/specs/core/system-structure.md` を参照する（components / composables / server/utils / データ取得 / 移行課題への参照はそこが持つ）。

## Naming Conventions

### Files

- **コンポーネント**: PascalCase（`NotificationTable.vue`、`ProjectRow.vue`）
- **composable**: `use` で始まる camelCase（`useNotifications.ts`）
- **server の API ルート**: Nitro の規約に従う（`projects.get.ts`、`projects.post.ts`）
- **テスト**: 対象と同じ名前に `.test.ts` を付ける（`diff.test.ts`）

### Code

- **型・インターフェース**: PascalCase（`Notification`、`ProjectSummary`）
- **関数・変数**: camelCase
- **定数**: UPPER_SNAKE_CASE

## Import Patterns

### Import Order

1. 外部依存
2. `#imports` および `~/` から始まる内部モジュール
3. 相対 import
4. スタイル

### Module/Package Organization

**明示 import を使う。Nuxt の auto-import は使わない。**

- `imports: { autoImport: false }` で composable / util の自動 import を止め、`#imports` から明示的に import する
- `components.dirs` を空にしてコンポーネントの自動 import を止める
- Nuxt UI がモジュールとして登録するコンポーネントはこの規約の対象外（Nuxt の仕様上止められない）

`packages/` による deep module 構成は採らない。

## Code Structure Patterns

### Module/Class Organization

1. import
2. 定数
3. 型定義
4. 実装
5. エクスポート

### Function/Method Organization

- 入力の検証を先に行う
- 異常系は早期 return で抜け、正常系のネストを深くしない

### File Organization Principles

- 1ファイルは1つの責務に対応させる
- 外に出すものはファイル末尾でまとめてエクスポートし、それ以外はファイル内に留める
- **単体テストはソースと同居させない。** `test/` にソースの構造をそのまま写した位置へ置く（`test/server/utils/control/notify.test.ts` ↔ `server/utils/control/notify.ts`）
- テストが使う固定データは、そのテストと同じ位置の `__fixtures__/` に置く
- E2E は `e2e/` に置く

## Code Organization Principles

1. **境界は守る、内側は縛らない** — Module Boundaries と依存の向きは守る。その内側の書き方は実装に委ねる
2. **本家に触るコードは接点に閉じる** — 本家の形が変わったときに直す場所を1か所にする
3. **画面は判断しない** — 何が起きたかの判断は制御で終え、画面は結果を表示するだけにする

## Module Boundaries

- **画面 vs サーバー**: 画面（`app/`）は受け取った形を出すだけで判断しない。アプリ固有の判断と実装はサーバーの utils（関心単位: 本家接続 / 監視・通知 / セッション / 設定・起動）に集める。API 層（`server/api/` `server/routes/`）は両者をつなぐ口で、リソースで切る
- **アプリ vs 本家（spec-workflow-mcp）**: 本家に触るのは utils の本家接続だけ。ブラウザから本家 REST / WebSocket へ直接つながない。`.spec-workflow/` へ直接書き込まず、書き込みは本家 API 経由の3種（承認応答・仕様書保存・ステアリング保存）のみ
- **本家の形 vs 共有型**: 本家のペイロード型は本家接続のモジュールに閉じる。画面が見るのは `shared/`（ドメイン別ファイル）の形だけ。本家から受け取った情報を加工・再構成する仕様を勝手に足さない。足すかどうかはユーザーが決める（`docs/adr/0005`）
- **Dependencies direction**: 画面 → api → utils → 本家接続 の一方向。逆流しない。本家に触るモジュールは他の utils を知らない

## Code Size Guidelines

規定しない。

## Dashboard/Monitoring Structure (if applicable)

本アプリ自体がダッシュボードであり、その中にさらに独立したダッシュボード部分を持たない。本家ダッシュボードを監視する側の構造は上の Module Boundaries に従う。

### Example Structure:

```
server/
├── plugins/
│   └── upstream.ts          # 起動時に本家 WebSocket へ接続する
├── routes/
│   └── ws.ts                # ブラウザ向け WebSocket
└── utils/
    ├── upstream/            # 本家に触る唯一の場所
    │   ├── rest.ts
    │   ├── socket.ts
    │   ├── registry.ts      # activeProjects.json
    │   └── scan.ts          # 親パスの走査
    └── control/
        ├── diff.ts          # 前回値との比較
        └── notify.ts        # 通知の生成
```

### Separation of Concerns

stroke-board は本家 spec-workflow-mcp のプロセスから分離する。本家の起動・停止に責任を持たない。本家が動いていなければ「未接続」と表示し、stroke-board 自身は動き続ける。

### Documentation Structure

仕様は2系統に分けて置く。

| 系統 | 置き場 | 形 | 扱うもの |
|---|---|---|---|
| 機能的 specs | `openspec/specs/` | Requirement + Scenario（WHEN/THEN） | システムの振る舞い |
| 定義としての specs | `docs/specs/` | 要素で区分した資料 | 形・契約・設定・構造の決め |

#### ディレクトリ構造

```
docs/
├── specs/              # 定義としての specs（要素で区分）
│   ├── core/           #   構造・形・設定の定義
│   ├── api/            #   サーバ API の契約
│   ├── architecture/   #   ワークフロー・流れの定義
│   ├── reference/      #   モジュールの使い方
│   └── plan/           #   検討・経緯
├── adr/                # 設計判断
└── agents/             # エージェント向けの取り決め
```

#### ファイル配置

**`specs/core/`**

| ファイル | 中身 |
|---|---|
| system-structure.md | 構造の定義。統合後のあるべき配置の規範（詳細への入口） |
| schema.md | 入れ物の形と検証の規定（state.json / strokes.json） |
| settings-reference.md | 設定の正（ADR-0004）。ここに無いものは設定ではない |
| file-component.md | ポータル側: コンポーネント個別の props と参照元 |
| file-components.md | components の棚卸しと規範への対応 |
| file-composables.md | composable 一覧と規範への対応 |
| server-structure.md | server/utils の棚卸しと規範への対応 |

**`specs/api/`**

| ファイル | 中身 |
|---|---|
| api-contract.md | 画面・エージェントとサーバの境界。番号は question-flow と共通 |

**`specs/architecture/`**

| ファイル | 中身 |
|---|---|
| session-workflow.md | セッションのワークフロー定義（スキーマ配置・制約） |
| question-flow.md | 問いの往復（誰がいつ何を送り、状態がどう動くか） |
| spec-screen-flow.md | ポータル側: 仕様書画面の流れ |
| data-fetching.md | 画面のデータ取得と SSR の設計 |

**`specs/reference/`**

| ファイル | 中身 |
|---|---|
| stroke-modules.md | useAgentQuestion / AgentQuestionModal の使い方 |

**`specs/plan/`**

| ファイル | 中身 |
|---|---|
| artifact-extension-plan.md | 拡張 artifact の検討資料（未決定） |
| next-agent-run.md | エージェント実行の3区分への汎用化案（未着手） |
| mainline-merge.md | 旧 stroke-board-frontier 統合の道筋（記録） |
| structure-migration.md | 構造の規範に対する現状の差分（移行課題） |


`docs/specs/` の外に置くもの:

- 用語はルートの `CONTEXT.md` に残す
- 設計判断は `docs/adr/` に ADR として残す。本家の内部挙動に依存する事実も ADR に残す
- エージェント向けの取り決め（issue tracker / triage / domain / subagents）は `docs/agents/` に置く
- docs の索引は `CLAUDE.md` の Docs 節が持ち、配置が変わったら同じ変更のなかで追随させる
