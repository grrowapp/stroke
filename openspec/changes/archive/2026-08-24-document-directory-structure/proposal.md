# document-directory-structure — Proposal

## Why

`restructure-docs-specs` で置き場は `docs/specs/` に揃ったが、構造の定義は `docs/specs/core/` の2本に割れたままである。

- `structure.md` — ストローク側: 領域名・区分・URL・置き場の規則
- `structure-design.md` — ポータル側: 層の積み方と部品の配置

また、リポジトリ全体の**ディレクトリ構造**は steering の structure（dashboard 管理）にしか無く、docs 側に無い。統合済みの1つのアプリに対して、構造の定義を1本にし、ディレクトリ構造を docs へ掻き出す。

## What Changes

- `structure.md` と `structure-design.md` の2本を**マージと微調整**で1本にし、最終の structure を `docs/specs/core/system-structure.md` に作る
- 統合後の実態から抽出した**ディレクトリ構造**をこの最終 structure が持つ
- `structure-design.md` は廃止し、現役の参照を張り替える
- steering の structure（dashboard 管理）を**連動して更新**する。アクセスは dashboard API 経由・承認フロー（前 change と同じ方式)

## Capabilities

### New Capabilities

なし。

### Modified Capabilities

- `architecture-docs` — 「構造を説明する資料は `docs/specs/core/structure-design.md` の1ファイルでなければならない（SHALL）」と名指ししている。**本 change はこの規定と矛盾する**ため、名指しを最終の `docs/specs/core/system-structure.md` へ変更する（1ファイル規定は維持）

## Impact

`structure-design.md` への現役参照の張り替えが要る。

| 参照元 | 方針 |
|---|---|
| `openspec/specs/architecture-docs/spec.md`（7箇所・SHALL 名指し） | 張り替える（Modified Capabilities のとおり） |
| `CLAUDE.md`（Docs 索引） | マージ後の1本に追随させる |
| `docs/specs/` 内の相互参照（spec-screen-flow / artifact-extension-plan / file-composables / file-component） | 張り替える |
| `openspec/changes/restructure-docs-specs/`（完了済み change の記録） | **触らない**（当時の配置の記録として残す） |
| steering の structure（ファイル配置の表に structure-design.md の行がある） | 連動更新で消える |

## 後続との関係

`restructure-docs-specs` の proposal が挙げた後続3本のうち「各要素の中身整理」の一部（core の構造2本）を本 change が担う。取捨・統合の残り（`file-component.md` / `file-components.md` の重複など）と導線の定義は引き続き別 change。
