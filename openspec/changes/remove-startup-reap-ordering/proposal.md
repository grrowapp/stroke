## Why

**この制約は、ユーザーの指示でも既存の規定でもなく、実装中にエージェントが自分で決めて入れたものである**（ユーザー指摘 2026-09-01「後始末のタイミングを勝手に規定するな」）。そして**根拠として書いた理由が、ソースを読むと成り立たない。**

### 何を入れたか

`fix-orphan-run-on-restart` の実装で、起動時の後始末（`server/plugins/01.reap-running.ts`）と巡回（`server/plugins/01.retry-failed.ts`）の間に**順序の取り決め**を新設した。実体は3つ。

1. `server/utils/stroke/reap-gate.ts`（新規） — `beginReap` / `awaitReap` の門
2. `server/plugins/01.retry-failed.ts` — 最初の周回の前に `await awaitReap()`
3. `openspec/changes/fix-orphan-run-on-restart/specs/agent/invocation/spec.md:35` — 「後始末が済むまで、その対象への起動を行ってはならない（MUST NOT）」と Scenario「後始末より先に起こし直さない」（:63-67）

もとの実装に順序の取り決めは無かった。後始末を専用プラグインへ切り出したこと自体も含め、design での判断である。

### 書いた根拠が成り立たない

`01.retry-failed.ts` の docblock はこう書いている。

> 後始末（`01.reap-running.ts`）が済む前に巡回が `failed` を起こし直すと、後始末が
> まだ倒していない `running` の対象へ2つ目の claude を立てかねない

**巡回は `running` を拾わない。** 同じ docblock の上段が「一覧から `invocation === 'failed'` の件**だけ**を取り、**他の判定を持たない**」と述べており、`shouldRetry`（`server/utils/stroke/sweep.ts`）もそうなっている。`openspec/specs/portal/batch/spec.md` の規定も同じである。後始末がまだ倒していない対象は `running` のままなので、**巡回はそもそも触れない。** 引用した文は自分自身の1段落上と矛盾している。

### 順序を取り決めなくても二重起動が起きない理由

守っているのは**対象1件ごとの順序**であって、プラグイン同士の順序ではない。`server/utils/stroke/reap.ts` の `reapRunning` は `running` の1件ごとに次を行う。

- 一致するプロセスが無い → `failed` を書く（生きているプロセスは1つも無い）
- 他インスタンスのもの → **何も書かない**（`running` のまま）
- 自分のもの → **`terminate` が終了を確かめてから** `failed` を書く。確かめられなければ `error`

`terminateProcess` の docblock も「**確かめてから `failed` を書く**——signal を送っただけでは、まだ終了処理の途中の claude が MCP を呼んで記録を上書きし得る」と、その理由を述べている。

したがって**ある対象が `failed` になるのは、その対象の孤児が死んだことを確かめた後だけ**である。巡回がいつ走ろうと、`failed` を見て起こし直す時点で孤児は居ない。門は何も守っていない。

### 「`failed` なのに孤児が生きている」経路も無い

門が要るとすれば、後始末が見ない `failed` の対象に孤児が生きている場合だが、これも起きない。時間切れの経路は `server/utils/stroke/claude.ts:155` が先に `SIGKILL` を送り、その後で `server/utils/stroke/ai.ts:256` が `failed` を書く。**倒すのが先、書くのが後**なので、途中でサーバーが落ちれば残る記録は `running` になり、後始末が拾う対象に入る。

### 消さないと何が起きるか

**動かない機構ではなく、偽の根拠が残ることが問題である。**

- 次の担当者は、`reap-gate.ts` と spec の MUST NOT を見て「順序を崩すと二重起動する」と読む。**崩しても起きない。** 存在しない制約を守るために設計が縛られる
- 巡回の初回が門を待つぶん、後始末が遅い環境（`ps -ww -e` が重い、対象が多い）で最初の起こし直しが遅れる。得るものが無いのに待つ
- `agent/invocation` に MUST NOT が1本増える。この capability は「起動は1系統」「書き込むのは invokeAi だけ」といった**実際に守らないと壊れる**規定の置き場で、そこに実効の無い MUST NOT を混ぜると、どれが本物か読み分けられなくなる
- 実測でこの門を通した確認はしていない。tasks 4.5 は「Nitro のプラグイン実行順そのものは vitest から検証できない」ため、**門の実体（`reap-gate.ts`）をテストで固定しただけ**で、順序が要ることは一度も示していない

## What Changes

- 削除: `server/utils/stroke/reap-gate.ts` と、そのテスト
- 削除: `server/plugins/01.retry-failed.ts` の `await awaitReap()` と、「最初の周回は後始末の完了を待つ」の節
- 削除: `fix-orphan-run-on-restart` の specs から、順序の MUST NOT（:35）と Scenario「後始末より先に起こし直さない」（:63-67）
- 変更: 代わりに**対象1件ごとの順序**——「終了を確かめてから `failed` を書く」——が二重起動を防いでいることを、`reap.ts` の docblock と `01.retry-failed.ts` の docblock に書く
- 変更: **出典の誤りを直す。** 上の規定は `fix-orphan-run-on-restart` の `agent/invocation` delta（`specs/agent/invocation/spec.md:30`）にあり、`server/session-management` には無い（本体・delta とも該当なし。specs 作成時 2026-09-01 に確認）。`server/utils/stroke/reap.ts` の `terminateProcess` の docblock が `server/session-management` を引いているのは誤りなので、同じく直す
- 変更: `server/plugins/01.reap-running.ts` から `beginReap` の呼び出しと門に関する記述を外す（`reap-gate.ts` を消すとこのファイルも壊れる）
- 変更: `fix-orphan-run-on-restart` の tasks 4.5 を、門ではなく**対象1件ごとの順序**を固定するものへ差し替える

**後始末そのものは残す。** 専用プラグインへの切り出し、argv 照合、他インスタンスに触らないこと、`error` への倒し方はいずれも実機で確かめてある（2026-09-01: 他インスタンスの実行は「触らなかった 1 件」で無傷、自分の孤児は「止めた 1 件・failed にした 1 件」）。**消すのは順序の取り決めだけである。**

## Capabilities

### New Capabilities

なし。

### Modified Capabilities

- `agent/invocation`: `fix-orphan-run-on-restart` が足そうとしている順序の MUST NOT を入れない。同 change はまだ archive していないので、本 change は**その delta を書き換える**形になる

## Impact

- `server/utils/stroke/reap-gate.ts` — 削除
- `test/server/utils/stroke/reap-gate.test.ts` — 削除
- `server/plugins/01.retry-failed.ts` — 待ち合わせと docblock の節
- `server/plugins/01.reap-running.ts` — `beginReap` の呼び出しと門に関する docblock
- `server/utils/stroke/reap.ts` — docblock（何が二重起動を防いでいるか）
- `openspec/changes/fix-orphan-run-on-restart/specs/agent/invocation/spec.md` — 順序の Requirement と Scenario
- `openspec/changes/fix-orphan-run-on-restart/tasks.md` — 4.5
- **`docs/` への整合反映は要らない。** 順序は docs のどこにも書いていない（`update-docs-for-runtime-fixes` の `S1`・`S2` は後始末の**内容**についてで、順序には触れていない）
