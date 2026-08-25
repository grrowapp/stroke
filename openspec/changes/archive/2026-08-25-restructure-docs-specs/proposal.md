# restructure-docs-specs — Proposal

## Why

`docs/` 直下には、性格の違う資料が15本平置きで混在している。設定の正（`settings-reference.md`）のような**定義**、実装から抽出した**写し**、採否未定の**検討**、統合の**経緯**が同じ階層に並び、「仕様の決めがどこにあるか」「答え合わせで何を見るか」が置き場から読み取れない。

`openspec/specs/` は全24本が Requirement + Scenario（WHEN/THEN）の**機能的 specs** で統一されており、区分の混在は docs 側だけにある。そこで docs 側に**定義としての specs** の置き場 `docs/specs/` を新設し、要素で切って集約する。

本 change は**配置**と、それに追随する **steering の structure 書き換え**を扱う。ファイルの取捨・統合・中身の編集・導線（答え合わせの規定）の定義は後続の change で個別に着手する（後述）。

## What Changes

`docs/specs/` を新設し、docs 直下の15本を次の5要素へ移動する。**中身は変更しない**（移動と、移動に伴う参照の張り替えのみ）。

```
docs/specs/
├── core/          structure.md / structure-design.md / schema.md /
│                  file-component.md / file-components.md / file-composables.md /
│                  settings-reference.md
├── api/           api-contract.md
├── architecture/  session-workflow.md / question-flow.md / spec-screen-flow.md
├── reference/     stroke-modules.md
└── plan/          artifact-extension-plan.md / next-agent-run.md / mainline-merge.md
```

- `docs/adr/` と `docs/agents/` は**触らない**（移動しない）
- 移動は git の履歴が追える形（`git mv`）で行う

あわせて、dashboard 管理下にある steering の **structure**（統合前のポータル構成のまま）を、統合後の実態と新しい docs 配置に書き換える。アクセスは dashboard API 経由でファイルを直接触らない（design 参照）。steering の product / tech は触らない。

## Capabilities

### New Capabilities

なし。コード・機能の能力変更は含まない（ドキュメント配置のみ）。

### Modified Capabilities

なし。

## Impact

移動する15本への参照が repo 内に残るため、張り替えが必要になる。docs 外からの参照の内訳:

| 参照元 | 件数 | 方針 |
|---|---|---|
| `CLAUDE.md` / `README.md` | 各1 | 張り替える（docs 一覧の索引も新配置に追随） |
| `nuxt.config.ts` / `openspec/config.yaml` | 各1 | 張り替える |
| `openspec/specs/architecture-docs/` | 1 | 張り替える |
| `server/utils/stroke/` のコメント | 3 | 張り替える |
| `docs/` 内の相互参照・`docs/adr/` 3本のリンク | 複数 | 張り替える（adr はファイル移動せず、リンク文字列のみ追随） |
| `openspec/changes/`（現役5 change・8ファイル） | 8 | 張り替える |
| `openspec/changes/archive/` | 35 | **触らない**（過去の記録。当時のパスのまま残す） |

## 後続の change（本 change のスコープ外）

配置後に個別に着手する。着手順・要否は未定。

1. **取捨・統合** — `file-component.md` と `file-components.md` の重複解消を含む、残るもの/残らないものの確定
2. **導線の定義** — 「何を知りたいときどこを見るか・食い違ったらどちらが勝つか」の規定を書く
3. **各要素の中身整理** — core / api / architecture / reference / plan それぞれの内部の詰め
