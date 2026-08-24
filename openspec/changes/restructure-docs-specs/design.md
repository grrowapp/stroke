# restructure-docs-specs — Design

## Context

`docs/` 直下の15本は、定義・写し・検討・経緯が平置きで混在している。`openspec/specs/`（機能的 specs、Requirement + Scenario 形式24本)と対になる**定義としての specs** の置き場が無い。

また、この repo は spec-workflow の dashboard にプロジェクト `stroke-board · base2` として登録されており、steering 文書3本（product / tech / structure）が dashboard 管理下にある。このうち structure は**旧 stroke-board（統合前のポータル単体）のディレクトリ構成のまま**で、統合後の実態とも本 change の新配置とも一致しない。

## Goals / Non-Goals

**Goals:**

- `docs/specs/` を新設し、docs 直下15本を要素5区分（core / api / architecture / reference / plan）へ移動する
- 移動に伴う参照の張り替えで、現役の参照切れを出さない
- steering の structure を、統合後の実態と新しい docs 配置に追随させる

**Non-Goals:**

- ファイルの取捨・統合（`file-component.md` と `file-components.md` の重複解消を含む）— 後続 change
- 導線（答え合わせの規定）の定義 — 後続 change
- 各文書の中身の編集（張り替え対象のパス文字列を除く）
- steering の product / tech の書き換え
- `docs/adr/` と `docs/agents/` の移動

## Decisions

### 1. 配置 — 要素で切る5区分

ユーザー指定の確定事項。判断の余地は残っていない。

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

### 2. 移動は `git mv`、中身は不変

履歴の追跡を切らないため `git mv` で移動する。文書の中身はパス文字列の張り替え以外変更しない。

**Alternatives considered:**
- コピーして旧を削除: 履歴が切れるため却下

### 3. 参照の張り替え範囲 — 現役のみ、記録は残す

張り替えるのは現役の参照（CLAUDE.md / README.md / nuxt.config.ts / openspec/config.yaml / openspec/specs/architecture-docs / `server/utils/stroke/` のコメント3件 / 現役 change 8ファイル / docs 内相互参照 / adr 3本のリンク文字列）。

`openspec/changes/archive/` の35ファイルは**触らない**。過去の記録は当時のパスのまま残す。

**Alternatives considered:**
- archive も張り替える: 記録の改変になるため却下

### 4. steering document の構造

steering は spec-workflow が規定する3本構成（product = 目的 / tech = 技術 / structure = 構成）をそのまま使う。独自の第4文書は足さない。本 change で書き換えるのは **structure のみ**。product / tech は統合後も記述の骨子が崩れていないため触らない。

structure の書き換えは **docs 配下の記述だけ**に限る（承認時の指摘: docs の配置のみが本 change の責務）。

- ディレクトリツリーの `docs/` 部分 — `docs/specs/` の5要素と adr / agents
- Documentation Standards — 定義としての specs（`docs/specs/`）と機能的 specs（`openspec/specs/`）の置き分け

統合後の実態（`stroke` 名前空間など docs 以外）への追随は本 change では行わない。

### 5. steering へのアクセスは dashboard API 経由 — ファイルを直接触らない

ユーザー指示。steering の読み書きは spec-workflow の管理下にあるため、`.spec-workflow/steering/` のファイルを直接読み書きしない。

- 読み: `GET /api/projects/:projectId/steering/structure`
- 書き: `PUT /api/projects/:projectId/steering/structure`

承認は dashboard 側の運用に従う（口頭承認で完了扱いにしない）。

**Alternatives considered:**
- `.spec-workflow/steering/structure.md` を直接編集: spec-workflow の管理・監視の外で書き換えることになるため却下（ユーザー指示とも矛盾）

## Risks / Trade-offs

- **張り替え漏れ**: 参照は grep で機械的に検出できるため、移動後に全15ファイル名で再走査して0件（archive 除く）を確認する
- **steering と実態の乖離**: structure の書き換えは docs 移動の後に行う。移動前に書くと新旧が混ざる
- **plan/ 内の性格差**: `mainline-merge.md` は経緯の記録であり将来の計画ではない（proposal で報告済み、ユーザー判断で plan 配置）
