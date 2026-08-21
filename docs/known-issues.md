# 未解消の事項

**まだ change に起こしていないもの**だけを置く。change を作ったらここから消す（実体は `openspec/changes/<change-id>/` に移る）。作業単位の管理は `docs/agents/issue-tracker.md` のとおり OpenSpec の change が担う。

## 既に change になっているもの

1. `add-session-management-command` — セッション管理の口（endpoint / script）と store を外す実行仕様の変更。旧 `remove-store-dependency` を統合済み
2. `remove-project-name-length-limit` — プロジェクト名の長さ上限の撤廃

---

## プロジェクト名の連番採番に上限が無い

`server/utils/project.ts:59-61` の `for (let n = 2; ; n++)` は終了条件を持たない。既存名が多いと際限なく回る。
