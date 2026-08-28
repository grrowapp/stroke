# move-conventions-to-steering

コーディング規約（auto-import 不使用・テスト・画面は判断しない）を steering へ移す（system-structure.md の定義・structure-migration.md の課題）

---

**起票時のメモとの差**（`.openspec.yaml` の note・`openspec/ticket/move-conventions-to-steering.md` は 2026-08-24 時点のもので、3項目すべてが未移設という前提で書かれている）

調べた結果、auto-import 不使用・明示 import と「画面は判断しない」は steering `structure.md` に着地済みだった。未移設はテスト規約だけで、この change が実際に移したのは次の2件。

- 置き場（`structure.md` File Organization Principles）— 単体テストはソースと同居させない / `test/` にソースの構造を写す / 固定データは `__fixtures__/` / E2E は `e2e/`
- 通す門番（`tech.md` Testing Requirements）— `typecheck`・`test`・`test:e2e` の3つを通す / `test:live` は門番に含めず `test` からも外す

あわせて `docs/` 側に残っていた規約の文面（auto-import・テスト置き場）を steering への参照に置き換えた。詳細は `proposal.md` を参照。
