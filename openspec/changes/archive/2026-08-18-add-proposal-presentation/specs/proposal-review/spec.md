## Purpose

把握完了時に AI が起こした proposal をユーザーが確認し、差し戻すか承認するかを決める場を提供する。承認はプロジェクト生成の唯一の引き金であり、その確定もここで行う。

## ADDED Requirements

### Requirement: proposal を Markdown プレビューで示す

システムは最新の proposal を画面2で Markdown としてレンダリングして示す SHALL。proposal は OpenSpec の proposal 形式（`## Why` / `## What Changes` / `## Capabilities` / `## Impact`）に従う。

#### Scenario: 画面2を開く

- **WHEN** phase が `proposed` のときユーザーが画面2を開く
- **THEN** 最新の proposal が Markdown プレビューとして表示され、承認と差し戻しの操作が並ぶ

### Requirement: proposal の見せ方を切り替えられる

システムは proposal の見せ方として、整形されたプレビュー、指摘を付けられる素の本文、その両方を並べた表示を用意する SHALL。指摘を付けられるのは素の本文の側とする。

#### Scenario: 見せ方を切り替える

- **WHEN** ユーザーが見せ方を切り替える
- **THEN** 同じ proposal が、選んだ見せ方で表示される

#### Scenario: プレビューでは指摘を付けない

- **WHEN** 整形されたプレビューだけを見ている
- **THEN** そこから箇所を選んで指摘を付けることはできない
