# プロジェクトの削除 — `DELETE /api/projects/:projectId`

作りきれなかったプロジェクトを消す。承認**以降**の局面のもののうち、**生成中（`approved`）だけ**を消し、完成した（`activated`）ものは拒否する。共通の約束は [contract.md](../contract.md)。

**根拠は phase であって `.spec-workflow/` の有無ではない。** そのディレクトリは生成（`POST /api/projects`）の依頼を本家が受理したときにでき、作りきれなかったプロジェクトも持っている。有無で断ると、失敗の決着で「破棄する」を選んだものが消せず一覧に居座る。

壊れた `state.json`（読めない・集合に無い phase）は消さない。分からないものは通さない。

## 対象の指し方

対象は `projectId` で指す。本家の id は workspace のパスから作られ、生成中の行はそれと**同じ式で導出した値**を持つ（`server/utils/upstream/project-id.ts`）。本家に登録されているかどうかは問わない（生成中でも接続時に載る）。id から名前を復元する手段はハッシュの性質上、保存先を走査して導出値と突き合わせるしかない。

## 実装の共有

削除の実行は[セッションの削除](../sessions/delete.md)と共通で `server/handler/delete.ts` に1つ置く。**どの局面のものを許すかは各 endpoint が持つ**——共通の実行に呼び出し元を知らせて分岐させない。phase の読みは `readState`（zod）で、endpoint の外に局面の述語を置かない。

## エラー

| status | 状況 |
|---|---|
| 404 | プロジェクトが無い |
| 409 phase | まだプロジェクトになっていない（`stroking` / `proposed`）。セッションの削除を使う |
| 409 phase | 中身のあるプロジェクト（`activated`） |
| 409 phase | `state.json` を読めない |
