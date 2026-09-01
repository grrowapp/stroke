## Context

動機は proposal.md「Why」。ここは実装の形を決めるのに要る現状だけを置く。

実装を読んで確かめた事実（`/home/vagrant/work/stroke-board/pre5`、2026-09-01）。

- `server/utils/stroke/claude.ts` の `spawn` に `detached` は無く、終了させる口も `runClaude` の中のタイムアウト（`SIGKILL`）だけである。**サーバー側に「起こした子プロセス」の台帳は無い**（`server/` に `spawn` は1箇所、`kill` はそのタイムアウトのみ）
- 接続表（`server/utils/mcp/connection-table.ts` の `Map`）と busy ガード（`server/utils/stroke/running.ts` の `Set`）はどちらもモジュール変数で、再起動で空になる
- 起動時の後始末は独立した処理ではなく、**巡回プラグイン（`server/plugins/01.retry-failed.ts`）の初回周回**が兼ねている。`first` のときだけ `running` を `failed` へ倒し、その周回では起こし直さず、60 秒後の次の周回が U13 を叩く
- 起こし直しの経路に busy ガードはあるが（`invoke-agent.get.ts` → `beginRun`）、再起動後は空なので必ず通る
- `claude` に渡している `--allowedTools` は `Skill Bash(openspec *) Read Edit Write`。孤児が HTTP を自力で叩く口は無く、MCP は 401 になる
- **`projectShareRoot` は両ワークツリーとも `/opt/projects` で同じ**（`nuxt.config.ts`）。ポートだけをずらして並走させる運用（CLAUDE.md「Dev サーバー」3399 / 3599）なので、**セッションの保存先は複数インスタンスで共有されている**
- 画面が回復の操作（`reset=1` の再実行）を出すのは `invocation` が `error` のときだけである（`app/composables/useWaitingRetry.ts`）

proposal との食い違いが1点ある。**孤児が終わっても `invocation` は書かれない。** `invocation` を書くのは `invokeAi`（`setInvocation` = A8）で、その継続は再起動で消えたプロセス／ワーカーの中にあり、二度と走らない。孤児自身に A8 を叩く口も無い（上記 `--allowedTools`）。したがって「孤児が新しい実行の `running` を上書きする」経路は現状のコードには無く、本 change でも**上書きを防ぐ仕組みは足さない**。守るのは順序（止める → 倒す → 起こす）である。

## Goals / Non-Goals

**Goals:**

- 再起動をまたいで残った claude を、起動時に**止めてから**記録を畳む
- 止められなかったものを自動で起こし直さない（同じ会話に2つ目の claude を立てない）
- 同じ保存先を共有する**別インスタンスの実行に触らない**

**Non-Goals:**

- 接続表の永続化。archive 済み change `provide-operations-via-mcp` の design.md「接続表はメモリ上の層とする」を覆さない。孤児側のツール呼び出しが 401 になること自体は変えない
- 孤児が途中まで進めた作業の救済。会話は `--resume` で続くので、起こし直しが続きから拾う
- 正常なシャットダウン時に子を道連れにする仕組み（`nitro.hooks.hook('close')` での kill）。dev の再起動は必ずしも hook を通らず、これに頼ると後始末が要らなくなるわけではない。起動側の後始末を正とする
- タイムアウト・リトライ上限・巡回間隔の設計変更

## Decisions

### Decision 1: 後始末の対象は「記録した pid」ではなく「走っているプロセスの照合」で見つける

起動時に走っているプロセスの一覧（`ps -ww -e -o pid=,args=` 相当）を取り、**argv の中身**で対象を特定する。手がかりは argv にすべて載っている。

- そのインスタンスの `claude.apiBaseUrl`（`--mcp-config` の `url` = `<apiBaseUrl>/mcp`）→ **自分が起こしたものか**
- 会話 id（ストローク: `--session-id` / `--resume` に載る対象の uuid。steering: `--resume` に載る `state.json` の `runId`、初回は `--mcp-config` に載る cwd = プロジェクトパス）→ **どの対象の実行か**

**pid を `state.json` に持つ案は採らない。** A8 の契約（受けるのは `invocation` と `retries` だけ・`api/stroke/submission`）と `state.json` のスキーマ（`docs/specs/core/schema.md`）を広げることになり、書き込み口の追加まで要る。しかも pid は再利用されるので、殺す前に argv の照合が結局要る——照合が要るなら、照合だけで足りる。過去の実行（本 change より前に起こされた孤児）も拾えるという利点もある。

**接続表の永続化案も採らない**（決定に反する。上記 Non-Goals）。

### Decision 2: 自分のものかは「自分の `apiBaseUrl` が argv に在るか」で見分ける

同じ `projectShareRoot` を 3399 と 3599 が共有している以上、**「対象 X の claude が走っている」だけでは殺してよいか決まらない**。`apiBaseUrl` はインスタンスごとに違い（ポートが違う）、`--mcp-config` の JSON として argv に平文で載る（archive 済み design.md の既知のトレードオフ）。再起動で失われず、外から見えるので、見分けの手がかりに使える。

起動直後の時点で「自分の `apiBaseUrl` を持つ claude」が走っていれば、それは必ず前のプロセスの残骸である——このプロセスはまだ何も起こしていないからで、巡回プラグインが `first` に置いていた判断と同じ根拠を、対象を絞ってそのまま使う。

代替案「ppid が 1 になっているものを孤児とみなす」は採らない。dev の再起動はワーカー（`worker_threads`）の入れ替えで起こることがあり、その場合 OS プロセスは生き残るため ppid が 1 にならない。**ppid では孤児かどうかを決められない。**

### Decision 3: 後始末を巡回から切り出し、起動時の専用ステップにする

いまは巡回プラグインの初回周回が兼ねているが、これは `portal/batch` の規定（「巡回は `failed` だけを拾う」「それ以外の条件判定を持ってはならない」「`running` は拾ってはならない」）と**すでに食い違っている**。後始末を専用のプラグインへ出すと、巡回は `failed` だけへ戻り、規定と再び合う。

- 後始末: 起動時に1回だけ走る。プロセスの照合 → 終了 → 記録の書き換え
- 巡回: `failed` を拾って U13 を叩くだけ。**後始末の完了を待ってから**最初の周回を走らせる

`docs/specs/architecture/session-workflow.md` は既に `server/plugins/01.reap-running.ts` という名前でこの処理を指しており（実体は `01.retry-failed.ts`）、分けた形の方が資料の記述に近い。

### Decision 4: 止められなかった／判定できなかったものは `error` へ倒す

`failed` へ倒すと巡回が拾って起こし直し、**止められていない claude と2つ目が並ぶ**。かといって `running` のまま放置すると、画面に回復の操作が出ない（`useWaitingRetry` が再実行を出すのは `error` のときだけ）。`error` は「自動では何もせず、ユーザーの再実行または削除を待つ」終端として既にあるので、これを使う。

その結果 `error` の意味は「リトライ上限到達の終端」から「**自動では回復しない終端**」へ広がる。4値は増やさない——新しい値を足すと、画面・CLI・スキーマ・巡回の判定がすべて影響を受ける。

### Decision 5: 終了のシグナルは既存のタイムアウトと同じ `SIGKILL`

`runClaude` のタイムアウトが既に `SIGKILL` を使っており、そこで殺された実行が `--resume` で続けられることは実測で確かめられている（`.scratch/stroke-board-frontier/decisions.md`: 強制終了させても入力は履歴に入っている）。後始末だけ別のシグナルにする理由が無い。

### Decision 6: 「上書きを防ぐ」仕組みは足さない

Context に書いたとおり、孤児が `invocation` を書く経路は無い。防ぐべきは書き込みの競合ではなく**順序**なので、「後始末が済むまでその対象を起こさない」（specs `agent/invocation`）だけを担保する。A8 に書き手の識別（実行ごとの token など）を足す案は、契約を広げる割に守る相手が居ないので採らない。

## Risks / Trade-offs

- [プロセス一覧を取れない環境（`ps` が無い・権限が無い）] → 「判定できない」に倒れ、対象は `error` になる。自動では動かなくなるがユーザーに引き渡される。黙って `failed` にして二重起動するより安全側
- [claude が持つ孫プロセス（steering の `npx @pimzino/spec-workflow-mcp`）が残る] → 親を殺すと stdio が閉じ、通常はそれで終わる。残った場合、次の後始末では拾えない（照合に当たらない）。実装時に stdio MCP の終了まで確かめる
- [argv に頼る照合] → `--mcp-config` の渡し方（JSON 直渡し）を変えると照合が壊れる。`invoke.ts` の組み立てと後始末の照合が同じ事実を見ていることを、テストで固定する
- [`apiBaseUrl` を 2つのインスタンスで同じ値にしてしまうと見分けがつかない] → CLAUDE.md「Dev サーバー」の「並走させる worktree はポートをずらす」に依存する。ずらし忘れると互いの実行を殺し合う。起動時チェック（`server/plugins/00.startup-checks.ts`）で検出できるかは実装時に判断する
- [pid の再利用] → argv の照合を通してから殺すので、無関係のプロセスを殺さない
- [いまの実装は他インスタンスの `running` も `failed` へ倒している] → 本 change で止む（自分のものと確かめられない実行には触らない）。逆に言えば、**現状は再起動のたびに他インスタンスの実行を巻き込んで二重起動させうる**

## Migration Plan

- 状態の移行は無い。`state.json` の形は変えず、新しい設定値も増やさない
- 本 change より前に起こされた孤児も、pid の記録に頼らないので初回の起動時後始末で拾える
- ロールバックは、後始末プラグインを外して巡回の初回周回に戻すだけでよい

## 上位資料への整合反映（提案・ユーザー承認待ち）

`docs/agents/issue-tracker.md`「更新対応」に従い、**承認を得るまで書き換えない**。提案は次の3件。

1. `docs/specs/architecture/session-workflow.md`「実行の記録（`invocation`）」の箇条書き
   「サーバー再起動で宙に浮いた `running` は、起動時に `failed` へ倒して巡回に拾わせる（`server/plugins/01.reap-running.ts`）」
   → 「サーバー再起動で残った claude は、起動時にまず終了させてから `failed` へ倒し、巡回に拾わせる。終了させられない／自分が起こしたものか判定できないものは `error` へ倒してユーザーに引き渡す」へ改める。併せて**ファイル名の食い違い**を直す（資料は `01.reap-running.ts`、実体は `01.retry-failed.ts`。本 change で後始末を切り出すなら資料の名前の方に寄せる）
2. 同ファイルの状態遷移図に `running --> error: 起動時に後始末できない` を足す
3. `server/utils/stroke/sweep.ts` の doc コメントが巡回を `server/plugins/02.retry-failed.ts` と書いている（実体は `01.`）。これは docs ではなくコードなので、実装タスクの中で直す

なお `docs/specs/core/schema.md` の `state.json` の表は、本 change 以前から実装と食い違っている（`retries` / `runId` が無く、`invocation` の値に `error` が無い）。**本 change はこの表を変える必要が無い**（保存する項目を増やさない）ため、修正は別途ユーザーへ報告して判断を仰ぐ。
