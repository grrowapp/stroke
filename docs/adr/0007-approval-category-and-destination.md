# ADR-0007: 承認依頼はステアリング文書にも立ち、飛び先は承認画面である

- **状態**: 採用
- **日付**: 2026-08-21

## 決定

通知「承認依頼の発生」の飛び先は、対象が仕様ドキュメントであってもステアリング文書であっても、
**そのプロジェクトの承認画面**とする。仕様書画面・ステアリング画面へは送らない。

## 背景

[ADR-0006](./0006-upstream-observed-behaviour.md) に「ステアリング文書の更新は検出できない」と
書いてある。これは正しいが、そこから「ステアリングは通知に関係しない」と読み違えられる。
**文書の更新**が検出できないことと、**その文書に対する承認依頼**が検出できることは別である。

## 根拠

稼働中の本家 v2.2.5 から実際に取得した pending の承認依頼が、3件とも `category: "steering"` だった。

```json
{"id":"approval_1786976855197_mfzyl3llh",
 "title":"ステアリング: structure.md（プロジェクト構成）の承認",
 "filePath":".spec-workflow/steering/structure.md",
 "type":"document","status":"pending",
 "category":"steering","categoryName":"steering"}
```

`ApprovalRequest` は `category: 'spec' | 'steering'` を持つ（`dist/dashboard/approval-storage.js`）。
`request-approval` の入力スキーマにも同じ enum がある（`dist/tools/approvals.js`）。
ステアリング文書は承認を経て確定するため、これは例外ではなく通常の経路である。

飛び先を承認画面にする理由は、本家の `ApprovalsPage` が `filePath` の中身を
`GET /api/projects/:projectId/approvals/:id/content` で取得して画面内に描画しているためである。
承認画面が対象文書のレビュー面そのものであり、仕様書画面やステアリング画面へ送ると
文書は読めても承認の文脈が落ちる。

`filePath` はプロジェクトルートからの相対パスで返る。絶対パスではない。

## 影響

- 通知の飛び先は2つだけになる。承認依頼 → 承認画面、タスクの3種 → タスク画面
- ステアリング画面は通知の飛び先ではない。ステアリング文書を読む場所としてのみ存在する
- `category` で飛び先を分岐しない。分岐は通知の種別（承認 / タスク）だけで足りる
