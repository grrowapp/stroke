## 1. 上限の撤廃

- [x] 1.1 `server/utils/request-schemas.ts` の `PROJECT_NAME_MAX` 定数と、`approveBody.projectName` / `proposalSubmitBody.projectName` の `.max(PROJECT_NAME_MAX)` を削除する
- [x] 1.2 `server/utils/session-store.ts` の `projectNameSchema` から `.max(100)` を削除する

## 2. 生成失敗の伝わり方の確認

- [x] 2.1 `server/utils/project.ts` の `generateProject` を確認し、実行環境が名前を受け付けず `mkdir` が失敗した場合に既存の汎用 catch で 500 として伝わることを確かめる（`isErrnoCode(error, 'EEXIST')` に該当しない失敗はすべて 500 に落ちる経路を通ることを確認するだけで、分岐追加は不要なはず）
- [x] 2.2 上記の確認結果に応じて、`generateProject` 冒頭のコメントに「長すぎる名前など環境が受け付けない場合もここで 500 になる」旨を補う

## 3. ドキュメントの整合

- [x] 3.1 `docs/api-contract.md` の該当エンドポイント（画面2の確定・A7）の記述を確認し、長さ上限に触れている箇所があれば削る
