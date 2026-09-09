## Context

動機は proposal.md「Why」。ここは、削除の対象を確定させるために実装を読んで確かめた事実だけを置く（`/home/vagrant/work/stroke-board/pre5`、2026-09-01 に確認・2026-09-04 に現行仕様へ更新）。

### 順序の取り決めの実体（3か所）

- `server/utils/stroke/reap-gate.ts` — `beginReap` / `awaitReap` の門。モジュール変数 `gate` に Promise を持つ
- `server/plugins/01.reap-running.ts` — 起動時の後始末。`reap()` の結果 Promise を `beginReap` に渡して門を開ける。**proposal.md の当初の Impact 一覧に無かったが、`beginReap` の呼び出しと import、および門を前提にした docblock はこのファイルにある。** 消すのは `01.retry-failed.ts` の `awaitReap()` 側だけでは足りない（決定2）
- `server/plugins/01.retry-failed.ts` — 巡回。最初の周回の前に `await awaitReap()` で門を待つ。docblock に「## 最初の周回は後始末の完了を待つ」の節がある

### 二重起動を防いでいる実体（対象1件ごとの順序）

`server/utils/stroke/reap.ts` の `reapRunning` は `running` の対象ごとに次を行う。

1. 判定できない（`listProcesses` が `null`・`phase` が `unknown` で照合対象を組み立てられない）→ `error` を書く
2. 走っているプロセスが1つも対象に一致しない → もう走っていない → `failed` を書く
3. 対象に一致するプロセスがある → `terminateProcess` で `SIGKILL` を送り、**`confirmTerminated` で終了を確かめてから** `failed` を書く。確かめられなければ `error`

**どのサーバーインスタンスが起こしたかは分岐に入らない。** `bootstrap/system/cleanup-agent-process`「起こしたインスタンスを判定条件にしない」がそれを規定しており、`reap.ts:13-14` と `docs/specs/architecture/session-workflow.md:115-116` も一致している。

`terminateProcess` の docblock は「確かめてから `failed` を書く」を `openspec/specs/server/session-management` からの引用として書いていた。**この引用は誤りである。** `session-management` にその文言は canonical・delta とも無い。正しい当て先は `openspec/specs/bootstrap/system/cleanup-agent-process`「走っている claude を終了させてから記録を畳む」である（決定3）。

「`failed` なのに孤児が生きている」経路が無いことも確認した。

- `server/utils/stroke/claude.ts:155`（`child.kill(CLAUDE_TIMEOUT_SIGNAL)`、`CLAUDE_TIMEOUT_SIGNAL` は8行目で `SIGKILL`）— タイムアウトで先に殺す
- `server/utils/stroke/ai.ts:256`（`await setInvocation('failed')`）— 殺した後に書く

殺すのが先、書くのが後なので、途中でサーバーが落ちても残る記録は `running` であり、後始末が拾う対象に入る。

### 巡回は `running` を拾わない

`server/utils/stroke/sweep.ts` の `shouldRetry` は `invocation === 'failed'` だけを true にする。`server/plugins/01.retry-failed.ts` もこれ以外の判定を持たない。`openspec/specs/portal/batch/spec.md` の「巡回は `failed` だけを拾って起動し直す」「`running`・`idle`・`error` は拾わない」と一致する。

## Goals / Non-Goals

**Goals:**

- 順序の取り決め（門・待ち合わせ）をコードから外す
- 二重起動を防いでいる実体（対象1件ごとの「終了を確かめてから `failed`」の順序）を docblock に残し、同じ思い違いの再発を防ぐ
- 後始末そのもの（専用プラグインへの切り出し・argv 照合・`error` への倒し方）は一切変えない

**Non-Goals:**

- **spec への規定の追加。** 決定1
- 後始末の判定ロジック（`reap.ts` の `reapRunning` / `reap-match.ts`）の変更
- `docs/` への整合反映。順序は docs のどこにも書かれていないため対象が無い
- archive 済み `openspec/changes/archive/2026-09-02-fix-orphan-run-on-restart/` の記録の書き換え。archive された記録は当時のまま残す（`docs/agents/issue-tracker.md`）

## Decisions

### 決定1: spec には何も足さない。`skip_specs: true` を立てる

**当初は `agent/invocation` へ ADDED Requirement「起動時の後始末と巡回は、互いの完了を待たない」を足す設計だった。2026-09-04 に取り下げた。**

取り下げの理由は2つ。

- **筋が通らない。** この change は「エージェントが自分の判断で規定を増やした」ことを正すものである。その是正として別の MUST NOT（「待ち合わせのための仕組みを設けてはならない」）を増やせば、やっていることは同じである。ユーザー判断「delta は不正。消すのが正しい」（2026-09-04）
- **当て先が無い。** 外す MUST NOT に対応する Requirement は canonical に存在しない。`fix-orphan-run-on-restart` の archive（2026-09-02）に伴う組み直しで、後始末の規定は `bootstrap/system/cleanup-agent-process` へ移り、順序の MUST NOT と Scenario は落とされた。canonical に対して `ADDED` も `REMOVED` も出ない

順序の取り決めを持たない理由は、規定ではなく docblock に残す（両プラグイン）。前例は `archive/2026-08-25-limit-project-name-numbering`——「削除対象に対応する Requirement が `openspec/specs/` に存在しないため `ADDED` も `REMOVED` も出ない」として `skip_specs: true` を立てている。

**代替案として検討し、採らなかったもの:**

- `bootstrap/system/cleanup-agent-process` へ当て先を移して Requirement を足す — 当て先は正しくなるが、規定を増やすこと自体がこの change の趣旨に反する
- `agent/invocation` に置いたまま本文の参照だけ直す — 当て先も趣旨も直らない

### 決定2: 削除対象は `01.retry-failed.ts` だけでなく `01.reap-running.ts` も含む

proposal.md の当初の Impact は `server/plugins/01.retry-failed.ts` の「待ち合わせと docblock の節」だけを挙げていたが、`reap-gate.ts` を消すと `server/plugins/01.reap-running.ts` の `import { beginReap } from '../utils/stroke/reap-gate'` と `beginReap(task)` の呼び出しがビルドを壊す。あわせて、この呼び出しのためだけに存在する `task` のラップ（`reap().catch(...)` → 再 throw → 二重 `catch` で unhandledRejection を防ぐ書き方）も、門が無くなれば不要になる——単に `void reap().catch(error => console.error(...))` で足りる。docblock の門についての記述も外す。

proposal.md の Impact はこの漏れを埋めてある。

### 決定3: `reap.ts` の docblock 引用を訂正する

`terminateProcess` の docblock が持つ `openspec/specs/server/session-management「終了したことを確かめてから invocation を failed へ変える」` の引用を、正しい当て先 `openspec/specs/bootstrap/system/cleanup-agent-process`「走っている claude を終了させてから記録を畳む」へ直す。

## Risks / Trade-offs

- [順序の取り決めを持たない理由が spec に残らない] → 根拠は両プラグインの docblock だけになる。再び門を入れようとする者が現れたら、同じ検証をやり直すことになる。それでも、実効の無い MUST NOT を capability に混ぜるほうが害が大きい——`agent/invocation` は「起動は1系統」「書き込むのは invokeAi だけ」といった**実際に守らないと壊れる**規定の置き場であり、そこに実効の無い1本を足すと、どれが本物か読み分けられなくなる（決定1）
- [実機（`yarn check:stroke`）での確認が未了] → tasks 3.3。ユーザー指示により実行していない。`yarn test` は全件通過している

## Migration Plan

- 状態・設定の移行は無い。削除するのはプロセス内のモジュール変数（`reap-gate.ts` の `gate`）と、それを待つ1行のコードだけで、永続化されたデータは関与しない
- ロールバックは、削除したファイル・行を戻すだけで足りる（後始末プラグイン自体は変えていないため、ロールバックしても後始末の機能は失われない）
