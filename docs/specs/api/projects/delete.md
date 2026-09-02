# プロジェクトの削除 — `DELETE /api/projects/:projectId`

作りきれなかったプロジェクトを消す。承認**以降**の局面のものだけで、`.spec-workflow/` を持つものは拒否する。共通の約束は [contract.md](../contract.md)。

## 対象の指し方

対象は `projectId` で指す。生成中・失敗した行は本家に登録されておらず registry から引けないので、**本家と同じ式で導出した値**を使う（`server/utils/upstream/project-id.ts`）。

## 実装の共有

削除の実行は[セッションの削除](../sessions/delete.md)と共通で `server/handler/delete.ts` に1つ置く。**どの局面のものを許すかは各 endpoint が持つ**——共通の実行に呼び出し元を知らせて分岐させない。
