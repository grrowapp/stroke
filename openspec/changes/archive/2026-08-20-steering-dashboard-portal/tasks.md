# Tasks — steering-dashboard-portal

## 1. ステアリング文書

- [x] 1.1 `write-steering-v2` で product.md / tech.md / structure.md の3本を新規に書く。 承認が返ってくるまで完了にしない

## 2. 設計判断の記録

- [x] 2.1 本家 spec-workflow-mcp v2.2.5 の実測を `docs/adr/` に残す（proposal.md の Risks が求めているもの）。内容は、アクティブ判定が registry の生存 PID であること・未接続プロジェクトが本家 API から取れないこと・生存確認がダッシュボード起動時の1回だけであること・イベントがスナップショット型で差分計算が要ること・ステアリング更新と承認却下の区別が検出できないこと
