# 中断したストローク — `GET /api/sessions/unfinished`

昇格前（`stroking` / `proposed`）のセッションを新しい順に返す。上層がこれを読み、完全な失敗に達した
セッションへの戻り道を出す（[failure.md](../../architecture/failure.md)「時間を置いて再開する」）。
共通の約束は [contract.md](../contract.md)。

- output: `SessionSummary[]`（`{ id, phase, updatedAt, path, invocation }`）。1件も無ければ `[]`

## 振る舞い

- 母集合は**`state.json` を持つディレクトリ**だけを見る。**U12 と母集合が違う。** U12 は実行環境
  （openspec ルートとスキーマ設定）が揃ったものだけを載せる契約で、初回の起動に失敗したセッションは
  載らない。戻り道が要るのはまさにその対象なので、ここでは実行環境を検査しない
- 昇格した対象（`approved` / `activated`）は返さない。あれはプロジェクトであり、プロジェクトの一覧
  （`GET /api/projects`）に出ている
- 読めないディレクトリ・`state.json` を持たないディレクトリは黙って飛ばす。保存先には無関係な
  ディレクトリも並びうる
- **プロジェクトの母集合は変えない。** 走査（`.spec-workflow` を持つディレクトリ）にセッションを
  混ぜない

## 実装のパス

実装は現状 `/api/strokes/unfinished` に在る。U 系の名前空間の移設は `fix-server-api-layout` の範囲で、
docs の正はこの資料のパスである（[overview.md](../overview.md)）。
