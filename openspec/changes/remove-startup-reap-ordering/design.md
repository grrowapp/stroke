## Context

動機は proposal.md「Why」。ここは、削除・追記の対象を確定させるために実装を読んで確かめた事実だけを置く（`/home/vagrant/work/stroke-board/pre5`、2026-09-01 時点）。

### 順序の取り決めの実体（3か所）

- `server/utils/stroke/reap-gate.ts` — `beginReap` / `awaitReap` の門。モジュール変数 `gate` に Promise を持つ
- `server/plugins/01.reap-running.ts` — 起動時の後始末。`reap()` の結果 Promise を `beginReap` に渡して門を開ける。**proposal.md の Impact 一覧に無いが、`beginReap` の呼び出しと import、および門を前提にした docblock（12〜21行目・28〜31行目）はこのファイルにある。** 消すのは `01.retry-failed.ts` の `awaitReap()` 側だけでは足りない
- `server/plugins/01.retry-failed.ts` — 巡回。最初の周回の前に `await awaitReap()` で門を待つ（67〜70行目）。docblock に「## 最初の周回は後始末の完了を待つ」の節がある（26〜35行目）

### 二重起動を防いでいる実体（対象1件ごとの順序）

`server/utils/stroke/reap.ts` の `reapRunning` は `running` の対象ごとに次を行う。

1. 一致する claude プロセスが無い → 誰のものでもないので `failed` を書く
2. 一致するが自分の `apiBaseUrl`（`--mcp-config` の `url`）を持たない → 他インスタンスのもの。**何も書かない**
3. 一致し自分のもの → `terminateProcess`（同ファイル）で `SIGKILL` を送り、**`confirmTerminated` で終了を確かめてから** `failed` を書く。確かめられなければ `error` を書く

`terminateProcess` の docblock は「確かめてから `failed` を書く」を、`openspec/specs/server/session-management「終了したことを確かめてから invocation を failed へ変える」`という引用付きで書いている。**この引用は誤り。** 該当する文言は `session-management` のどの spec（canonical・delta とも）にも無い。実際にこの文言（「終了したことを確かめてから `invocation` を `failed` へ変える SHALL」）を持つのは `openspec/changes/fix-orphan-run-on-restart/specs/agent/invocation/spec.md`（26〜37行目、ADDED Requirement「起動時に、残っている前の実行を後始末してから倒す」）である。proposal.md の「書いた根拠が成り立たない」節の一文「`server/session-management` の既存 Requirement が規定している」も同じ誤りを引き継いでいる。正しい参照先は `agent/invocation` であり、proposal.md の Capabilities 節（`agent/invocation` のみを Modified Capabilities に挙げる）はこの誤りを含んでいない——結果として本 change が触る capability は `agent/invocation` だけで正しい。

「`failed` なのに孤児が生きている」経路が無いことも確認した。

- `server/utils/stroke/claude.ts:155`（`child.kill(CLAUDE_TIMEOUT_SIGNAL)`、`CLAUDE_TIMEOUT_SIGNAL` は8行目で `SIGKILL`）— タイムアウトで先に殺す
- `server/utils/stroke/ai.ts:256`（`await setInvocation('failed')`）— 殺した後に書く

殺すのが先、書くのが後なので、途中でサーバーが落ちても残る記録は `running` であり、後始末が拾う対象に入る。

### 巡回は `running` を拾わない

`server/utils/stroke/sweep.ts` の `shouldRetry` は `invocation === 'failed'` だけを true にする。`server/plugins/01.retry-failed.ts` もこれ以外の判定を持たない。`openspec/specs/portal/batch/spec.md`（canonical、fix-orphan-run-on-restart の影響を受けない）の「巡回は failed だけを拾って起動し直す」「running・idle・error は拾わない」と一致する。

## Goals / Non-Goals

**Goals:**

- 順序の取り決め（門・待ち合わせ）を、コード・spec の両方から外す
- 二重起動を防いでいる実体（対象1件ごとの「終了を確かめてから `failed`」の順序）を、正しい capability（`agent/invocation`）の spec として残し、同じ思い違いの再発を防ぐ
- 後始末そのもの（専用プラグインへの切り出し・argv 照合・他インスタンス不可侵・`error` への倒し方）は一切変えない

**Non-Goals:**

- 後始末の判定ロジック（`reap.ts` の `reapRunning` / `reap-match.ts`）の変更。本 change は順序の取り決めだけを外す
- `docs/` への整合反映。proposal.md の Impact のとおり、順序は docs のどこにも書かれていないため対象が無い
- `fix-orphan-run-on-restart` の実装済みコード（`reap.ts` 等）への変更。同 change の artifact（specs・tasks）の書き換えのみを本 change の tasks に含める

## Decisions

### Decision 1: 新しい規定は `agent/invocation` に ADDED Requirement として置く

「Context」で確認したとおり、二重起動を防いでいる順序は `server/session-management` ではなく `agent/invocation` の話である。`fix-orphan-run-on-restart` の同 capability への delta（ADDED Requirement「起動時に、残っている前の実行を後始末してから倒す」）は、「終了を確かめてから `failed` を書く」という対象1件ごとの順序（30〜31行目）を既に規定しており、本 change はここを変えない——変えるのは同じ Requirement の中の**プラグイン間の順序**を規定した1文（35行目の MUST NOT）と、それに対応する Scenario（63〜67行目）だけである。

`fix-orphan-run-on-restart` はまだ archive していないため、この規定はまだ canonical の `openspec/specs/agent/invocation/spec.md` に無い。したがって本 change の specs delta は、その未archiveの delta を「本体からの削除」として書くことはできない（本体に無いものは消せない）。

代わりに本 change は、`agent/invocation` へ **新しい ADDED Requirement**「起動時の後始末と巡回は、互いの完了を待たない」を足す。中身は「対象1件ごとの順序で足りる」ことと「処理どうしの待ち合わせを設けない」ことの2点で、`fix-orphan-run-on-restart` 側が持つ「終了を確かめてから `failed`」の規定とは**別の Requirement**にして重複を避けた（同じ Requirement を2つの change が同時に ADD すると、どちらかが archive されたときにもう一方の delta が古い当て先を指すことになる）。

**代替案として検討し、採らなかったもの:**

- `server/session-management` に置く — proposal.md の誤った引用をそのまま引き継ぐことになる。実体は `agent/invocation` にある
- `portal/batch` に置く（巡回側の capability）— 巡回側の規定（「failed だけ拾う」）は既にあり食い違っていない。取り決めを持たないのは巡回・後始末の**両方**にまたがる話なので、両者を起動する側の `agent/invocation` に置く方が自然
- `fix-orphan-run-on-restart` の既存 ADDED Requirement を本 change が直接「MODIFIED」する — 本 change の specs delta は canonical spec に対する delta であり、archive されていない他 change の delta ファイルを直接の当て先にはできない（ツールの delta 解決は canonical 基準）。その代わり、`fix-orphan-run-on-restart` 側のファイル自体の編集（35行目の MUST NOT・63〜67行目の Scenario を外す）は、本 change の tasks に**別の作業**として持たせる（Decision 2）

### Decision 2: `fix-orphan-run-on-restart` の artifact 編集は tasks に載せ、この段では実行しない

外すべき箇所（proposal.md「外すもの」）は次の2つ。

- `openspec/changes/fix-orphan-run-on-restart/specs/agent/invocation/spec.md:35` の1文「後始末が済むまで、その対象への起動を行ってはならない（MUST NOT）。起こし直しの巡回も、ユーザーの操作による起動も、後始末の後に行う。」
- 同ファイル 63〜67行目、Scenario「後始末より先に起こし直さない」

および `fix-orphan-run-on-restart/tasks.md` の 4.5（「後始末が済むまで巡回が U13 を叩かない」をテストで固定した、という記述）を、対象1件ごとの順序（`reap.ts` の確認済みの分岐）を固定したものである旨に差し替える。

これらは他 change のファイルを書き換える作業であり、CLAUDE.md の issue-tracker 規約が想定する「この change の apply」の範囲を超える。ユーザー指示（「`fix-orphan-run-on-restart` の artifact の書き換えは tasks に載せるだけにして、この段では実行するな」）に従い、本 design では実行せず、tasks.md にチェックリスト項目として残す。

### Decision 3: 削除対象は `01.retry-failed.ts` だけでなく `01.reap-running.ts` も含む

proposal.md の Impact は `server/plugins/01.retry-failed.ts` の「待ち合わせと docblock の節」だけを挙げているが、`reap-gate.ts` を消すと `server/plugins/01.reap-running.ts` の `import { beginReap } from '../utils/stroke/reap-gate'` と `beginReap(task)` の呼び出し（39行目）がビルドを壊す。あわせて、この呼び出しのためだけに存在する `task` のラップ（`reap().catch(...)` → 再 throw → 二重 `catch` で unhandledRejection を防ぐ書き方、22〜33行目）も、門が無くなれば不要になる——単に `void reap().catch(error => console.error(...))` で足りる。docblock（14〜21行目・29〜31行目）の門についての記述も外す。

この作業もコード変更であり本 change の対象だが、proposal.md の Impact に漏れがあったため tasks に明記する（最終報告で proposal との食い違いとして報告する）。

### Decision 4: `reap.ts` の docblock 引用を訂正する

`terminateProcess` の docblock が持つ `openspec/specs/server/session-management「終了したことを確かめてから invocation を failed へ変える」` の引用を、正しい当て先——`fix-orphan-run-on-restart` が足す `agent/invocation` の Requirement（同 change archive 後は canonical `agent/invocation`）——を指すように直す。あわせて、本 change が `agent/invocation` に足す新しい Requirement（「起動時の後始末と巡回は、互いの完了を待たない」）への参照も、`01.retry-failed.ts` の docblock（順序の取り決めを持たない理由の説明として）に足す。

## Risks / Trade-offs

- [`agent/invocation` に2つの change（本 change と `fix-orphan-run-on-restart`）が別々の Requirement を ADD する状態が一時的に生まれる] → Decision 1 のとおり Requirement 名を分けてあるため、どちらが先に archive されても canonical 側で衝突しない。ただし両方が archive された後、内容が近い2つの Requirement が並ぶ（「対象ごとの順序」と「処理間の順序を持たない」）。読み手が別の規定と誤解しないよう、本 change の Requirement 文中で `fix-orphan-run-on-restart` 側の Requirement が担う内容（終了確認→`failed`）を明示的に参照している
- [`01.reap-running.ts` の編集が proposal.md の Impact に無かった] → Decision 3 で tasks に追加。最終報告で proposal との食い違いとして明示する
- [`fix-orphan-run-on-restart` の artifact 編集を本 change の tasks で行うと、2つの change のブランチ運用が絡む] → 同じ worktree・同じブランチ上での作業であり、`fix-orphan-run-on-restart` はまだ archive されていないので、そのファイルを編集しても archive 済み記録を書き換えることにはならない。編集後も同 change 自身の tasks（4.5 以外）の completion 状態は変えない

## Migration Plan

- 状態・設定の移行は無い。削除するのはプロセス内のモジュール変数（`reap-gate.ts` の `gate`）と、それを待つ1行のコードだけで、永続化されたデータは関与しない
- ロールバックは、削除したファイル・行を戻すだけで足りる（後始末プラグイン自体は変えていないため、ロールバックしても後始末の機能は失われない）
