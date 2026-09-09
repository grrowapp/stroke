# ADR-0010: 「作成」ボタンは常に押せる

- **状態**: archive（2026-08-29。全貌は [`docs/specs/plan/portal-stroke-entrance.md`](../specs/plan/portal-stroke-entrance.md) に確定。対応する節 — 常に押せる・判定の一元化:「エラーの出方（前提が欠けていても押せる）」／project-directory への影響:「仕様（project-directory）の置き直し」）
- **日付**: 2026-08-25

## 決定

プロジェクト一覧の「作成」ボタンは常に活性とする。ボタンはストロークの概要入力画面への入口
（[ADR-0009](./0009-create-enters-stroke-overview.md)）であり、押せるかどうかをサーバー側の
前提の充足で切り替えない。

前提の欠け（置き場に書き込めない・AI の起動定義が不正など）は、入った先のストローク側が表現する。
判定の実体は従来どおり `missingPrerequisites()`（呼ばれるたびに実際を見る）で、
AI 起動時の 503 として現れる。

## 背景

非活性の理由だった「接続先の別プロジェクトに繋がっていない」は、統合で接続先が同一アプリ内に
なったため成立しなくなった（ADR-0009）。残る候補は「ストローク側の前提が揃っているか」だったが、
これを一覧側でも判定するとストローク側の判定と二重になる。

## 根拠

- ストローク側は前提の欠けを検知して画面に出す仕組みを既に持つ（`invoke-agent` の 503、
  `openspec/specs/api/session/invoke-agent/`）。ボタンを灰色にしても同じ情報を別の場所に
  重ねるだけで、判定箇所が2つに増える
- ボタンは画面遷移しかしない。遷移自体に失敗する前提は無い

## 影響

- `project-directory` の要件「作成は接続先が無ければ行えず、その状態を画面に出す」は、作成については
  廃止相当になる。「押せない理由を画面に出す」の対象は登録だけが残る
- 「登録」は本決定の対象外。非活性のまま（理由 `meaning-undecided`）
- `actions.create`（`resolveDirectoryActions()` と `shared/types.ts` の理由コード `target-undecided`）の
  返し方・要否は change `connect-portal-and-strokes` の specs / design で詰める
