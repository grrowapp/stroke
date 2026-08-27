## Why

stroke-board が扱う2分類（feature / 仕様書）のうち、仕様書レーンのワークフロー定義の**置き場を先に確保する**ための change。中身は現時点では仮決めであり（`define-feature-workflow` の proposal 参照）、確定させる作業は本 change を進める段で行う。器と空の capability だけを先に用意しておく、という判断はユーザーによる（`define-feature-workflow` の承認レビュー 2026-08-26）。

## What Changes

現時点の仮決め（確定ではない。本 change を進める段で見直す）:

- 仕様書は openspec 的には `skip_specs: true` 相当の変形ワークフローで扱う。
- 工程は proposal → spec（形が少し違う）→ design と進み、tasks は無い。
- 最後に `docs/specs/` へ同期する。

## Capabilities

### New Capabilities

- `spec-document/workflow/overview`: 仕様書レーンの工程の全体像。**現時点では空**（placeholder）。中身の定義は本 change を進める段で行う。

### Modified Capabilities

なし。

## Impact

- 本 change は当面着手しない。feature レーン（`define-feature-workflow`）とその依存 change が先。
- 仮決めの内容が変わったら本 proposal を更新する。
- **`define-feature-workflow` の確定による影響**（2026-08-27 承認。正は `docs/feature/overview.md`）: feature レーンの定義が確定した。仕様書レーンの仮決め（proposal → spec → design、`docs/specs/` へ同期）は据え置き。本 change を進める段では、確定した feature レーンの定義（ticket は起票時に change と1対1・概要のみ・以後追記しない、等）との整合を取って中身を定める。
