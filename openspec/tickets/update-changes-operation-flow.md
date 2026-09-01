---
status: Open
tags:
  - inconsistency
---

# update-changes-operation-flow

change 運用の規定が資料に散っていて、実体とも食い違っている。ticket の置き場・change-id の命名・資料間の参照の方向・更新対応の手続きを、docs と CLAUDE.md に一貫した形で置き直す。

## 事実

起票時点で分かっていること。

- ticket の置き場が単数形 `openspec/ticket/` の参照で複数箇所に残っていた（実体は `openspec/tickets/`）
- ticket 起票のルールは `docs/feature/overview.md` と確定 spec にしか無く、起票の動線（`docs/agents/issue-tracker.md`・opsx コマンド・schema の instruction）からは見えない
- `docs/agents/issue-tracker.md` の schema 記述（`schemas/custom/` / `schema: custom`）が実在しない
- 資料間の参照の方向（docs > ADR > specs、逆流禁止、同層内の可否）が明文化されていない。ADR が archive されないまま docs と二重に生き、矛盾が増殖している
- `docs/feature/overview.md` と `docs/specs/architecture/feature-workflow.md` が両方「feature レーンの正」を名乗っている
- pre3 の change 命名 ADR（動詞始まり）が未統合。ADR 番号が pre5 の別 ADR と衝突する
