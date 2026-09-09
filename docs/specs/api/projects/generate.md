# プロジェクトの生成 — `POST /api/projects`

昇格したプロジェクトを本家 spec-workflow に存在させる。本家の登録の REST（`POST /api/projects/add`）へ依頼するだけの口で、ユーザーは叩かない。承認の後の実行（steering）の起動の材料を組み立てるとき、サーバーが AI を起動する前に叩く。共通の約束は [contract.md](../contract.md)。

- input: `{ projectPath: string }`（`projectShareRoot` 直下1階層の絶対パス）
- output: 本文なし（204）

## 振る舞い

- 作成なので id を取らない。本家が要るのはパスであり、呼び手は cwd としてパスを持つ
- AI を起動せず、改名せず、phase も `invocation` も書かず、上層へ配信しない。`state.json` も読まない
- 本家が登録済みのパスにも受理する（本家は同じ `projectId` を返す）。`.spec-workflow/approvals/` は登録を受けた本家が作る

## エラー

| status | 状況 |
|---|---|
| 400 | `projectPath` が無い・相対パス・親そのもの・親の外・2階層以上下 |
| 503 | 本家の URL が未設定・本家に届かない・本家が登録をエラーで返した（登録の口が無い 404 を含む） |
| 502 | 本家が 2xx で応答したが本文が `projectId` を持たない |
