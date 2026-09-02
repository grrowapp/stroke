---
status: Doing
change: remove-startup-reap-ordering
tags:
  - proposal
  - specs
  - design
  - tasks
triage:
  - bug
---

# remove-startup-reap-ordering

起動時の後始末と巡回の間に入れた順序の取り決め（`reap-gate.ts` の門・巡回の
`await awaitReap()`・`agent/invocation` の MUST NOT）を外す。

**ユーザーの指示でも既存の規定でもなく、`fix-orphan-run-on-restart` の実装中に
エージェントが自分で決めて入れたものである**（ユーザー指摘 2026-09-01
「後始末のタイミングを勝手に規定するな」）。

**しかも根拠が成り立たない。** `01.retry-failed.ts` の docblock は「後始末が済む前に
巡回が起こし直すと、まだ倒していない `running` の対象へ2つ目の claude を立てかねない」と
書くが、**巡回は `running` を拾わない**（同じ docblock の上段・`sweep.ts` の `shouldRetry`・
`openspec/specs/portal/batch/spec.md`）。

二重起動を防いでいるのは**対象1件ごとの順序**である。`reap.ts` の `reapRunning` は
`terminate` が終了を確かめてから `failed` を書き、確かめられなければ `error` にする。
ある対象が `failed` になるのはその孤児が死んだ後だけなので、巡回がいつ走っても孤児は居ない。
「`failed` なのに孤児が生きている」経路も無い——時間切れは `claude.ts:155` が先に `SIGKILL`
を送り、`ai.ts:256` が後で `failed` を書く。

残すと、次の担当者が実効の無い MUST NOT を本物の制約として守ることになる。

**後始末そのものは残す。** 実機で確認済み（2026-09-01: 他インスタンスの実行は
「触らなかった 1 件」で無傷、自分の孤児は「止めた 1 件・failed にした 1 件」）。

対応する change: `remove-startup-reap-ordering`
