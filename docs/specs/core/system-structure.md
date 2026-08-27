# 構造

stroke-board の構造の定義。**統合後のあるべき配置**を規範として定める。

- 用語は `CONTEXT.md`、決定の理由は `docs/adr/`、api の契約は `docs/specs/api/contract.md`
- components の全数と規範への対応は `docs/specs/core/file-components.md`、composables は `docs/specs/core/file-composables.md`、server/utils は `docs/specs/core/server-structure.md`
- データ取得・SSR の設計は `docs/specs/architecture/data-fetching.md`
- 現状との差分（移行課題）は `docs/specs/plan/structure-migration.md`
- コーディング規約（auto-import 不使用・テストなど）は steering が持つ

---

## 1. ディレクトリ構造

```
base2/
├── app/                        画面（Nuxt 4）
│   ├── app.vue                 アプリの殻（1つ）
│   ├── assets/css/             スタイル
│   ├── layouts/                シェル（形が変わる単位で1枚）
│   ├── pages/                  ルーティングのみ。実体は持たない
│   │   ├── index.vue           通知
│   │   └── projects/
│   │       ├── index.vue       list（プロジェクト一覧）
│   │       ├── create/         create（プロジェクトを起こすセッション）
│   │       └── [projectId]/    detail（specs / steering / tasks / approvals）
│   ├── components/             画面の実体はここが主体。ui ＋ 機能単位
│   │   ├── ui/                 機能に属さない共通部品
│   │   ├── notification/       通知
│   │   ├── project/            プロジェクト（一覧・登録・作成の入口）
│   │   ├── question/           問いの往復
│   │   ├── proposal/           proposal 確認・差し戻し・注釈
│   │   └── approval/           承認
│   └── composables/            関心単位の useXxx を平置き。境界のディレクトリを作らない
├── server/                     Nitro
│   ├── api/                    契約どおり（strokes は contract.md、projects は本家仲介）
│   ├── plugins/                起動時処理
│   ├── routes/                 WebSocket（ws.ts と api/strokes/:id/ws/** = 契約 W1・W2）
│   └── utils/                  関心単位で切る（§3 に一覧）
├── shared/                     画面とサーバーが共有する型（ドメイン別ファイル）
├── docs/                       specs（定義）/ adr / agents
├── test/                       単体テスト。ソースの構造をそのまま写す（app/ server/ …）
├── e2e/                        Playwright
├── openspec/                   機能的 specs と change
└── scripts/
```

---

## 2. 画面 — `app/`

- **pages はただのルーティング。** ページは薄く保ち、画面の実体は components が持つ
- **components は `ui/` ＋ 機能単位で切る。** 機能に属さない共通部品は `ui/`、機能の部品は機能のディレクトリ（notification / project / question / proposal / approval）。出自や画面グループの境界では切らない。部品が無い機能のディレクトリは作らない。全数の対応は `file-components.md`
- **composables は関心単位の `useXxx` を平置き**にする。境界のディレクトリを作らない。全数の対応は `file-composables.md`
- **単体テストはソースと同居させない。** `test/` にソースの構造をそのまま写した位置へ置く（`test/server/utils/control/notify.test.ts` ↔ `server/utils/control/notify.ts`）。テストが使う固定データも同じ場所（`__fixtures__/`）に置く。E2E は `e2e/`
- レイアウトはシェルの形が変わる単位で持つ（横タブの `portal.vue` / 左サイドバーの `workspace.vue`）。プロジェクト間の移動は一覧を経由する
- セッションへの入口はプロジェクト一覧の **作成** で、専用のトップページを持たない
- データ取得の設計は `docs/specs/architecture/data-fetching.md`

---

## 3. サーバー — `server/`

**api は契約が正。** セッション系（`/api/strokes/**`、WS を含む）は `docs/specs/api/contract.md` の番号どおり。プロジェクト系（`/api/projects/**`）は本家の読み取り10本と書き込み3本（承認応答・仕様書保存・ステアリング保存）で、`read-only.test.ts` が範囲を機械的に固定している。

**utils は関心単位で切る。** 区分は4つ — **本家接続 / 監視・通知 / セッション / 設定・起動**。全数の対応は `server-structure.md`。

守る制約は3つ。

1. **ブラウザから本家へ直接触らない。** 本家 REST も本家 WebSocket も、触るのは Nitro（サーバー）だけ
2. **本家の形を画面へ流さない。** 画面が見るのは `shared/` の形だけ。本家のペイロード型（`schema`）は utils の外へ出ない
3. **本家に触るモジュールは他の utils を知らない。** 依存は 画面 → api → utils → 本家接続 の一方向

`server/plugins/` はアプリ全体の起動時処理だけを持つ。本家は利用者が別途起動する前提で、繋がらなくても stroke-board は動き続ける。設定の正は `docs/specs/core/settings-reference.md`。ここに無いものは設定ではない（`docs/adr/0004`）。

---

## 4. 共有型 — `shared/`

画面とサーバーが共有する型。1つの型空間をドメイン別ファイルで持つ（1往復そのものは `Stroke` 型）。本家のペイロード型はここに置かず、本家接続のモジュールに閉じる。

---

## 5. 参照

| 資料 | 持つもの |
| --- | --- |
| `docs/specs/api/contract.md` | api の契約 |
| `docs/specs/core/schema.md` | 入れ物の形と検証 |
| `docs/specs/core/settings-reference.md` | 設定の正 |
| `docs/specs/core/file-components.md` / `file-composables.md` / `server-structure.md` | 部品・composable・utils の全数と規範への対応 |
| `docs/specs/architecture/data-fetching.md` | データ取得・SSR の設計 |
| `docs/specs/plan/structure-migration.md` | 現状との差分（移行課題） |
| `docs/adr/0002` / `0005`〜`0008` | 統合・本家の扱いの決定 |
| `docs/agents/` | エージェント向けの運用 |
