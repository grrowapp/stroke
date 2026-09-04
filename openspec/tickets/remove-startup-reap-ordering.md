---
status: Doing
change: remove-startup-reap-ordering
origin: user
tags:
  - proposal
  - specs
  - design
  - tasks
  - fix-orphan-run-on-restart/42b86225-851f-4ec5-a58e-60a291d1877e
triage:
  - bug
---

# remove-startup-reap-ordering

起動時の後始末と巡回の間に入れた順序の取り決め（`reap-gate.ts` の門・巡回の
`await awaitReap()`・spec の MUST NOT）を外す。

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

**後始末そのものは残す。**

---

## 起票時の記述の訂正（2026-09-04）

**`fix-orphan-run-on-restart` は 2026-09-02 に archive 済み**
（`openspec/changes/archive/2026-09-02-fix-orphan-run-on-restart/`）。archive 前に artifact ごと
組み直されており、起票時の前提が2点崩れた。

**訂正1: 当て先は `agent/invocation` ではない。** 後始末の規定は canonical
`openspec/specs/bootstrap/system/cleanup-agent-process/spec.md` へ移った。外す対象としていた
順序の MUST NOT と Scenario「後始末より先に起こし直さない」は、その組み直しで**既に存在しない**。
「同 change の delta を書き換える」という当初の形は成立せず、archive 済み記録は書き換えない。

**訂正2: 「他インスタンスの実行には触らない」は現行仕様ではない。** 起票時に実機確認として
書いた「他インスタンスの実行は触らなかった 1 件で無傷」は当時の実装のもの。現在は
`bootstrap/system/cleanup-agent-process`「起こしたインスタンスを判定条件にしない」が正で、
`server/utils/stroke/reap.ts` にその分岐は無い。有効な実機確認は「自分の孤児を止めた 1 件・
`failed` にした 1 件」（2026-09-01）だけである。

## 進捗

コード側（tasks 1章）は適用済み。`reap-gate.ts` とそのテストは無く、両プラグインの docblock は
「呼び出し順序の取り決めは持たない」と明記され、`reap.ts` の `terminateProcess` の引用先も
`bootstrap/system/cleanup-agent-process` へ訂正されている。

残りは tasks 3.3（実機確認・ユーザー指示で保留）と 5.1 / 5.2（レビュー・完了承認）。

proposal / design / specs / tasks には訂正1・2の食い違いが残っている。とくに specs delta は
`specs/agent/invocation/spec.md` に置かれたままで、本文が参照する「本 capability の別の
Requirement」（＝ `error` の規定）が当て先に存在しない。
