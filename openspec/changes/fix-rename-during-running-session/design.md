## Context

動機は proposal.md「Why」。ここでは、実装を読んで確かめた現状だけを置く（すべて `/home/vagrant/work/stroke-board/pre5` の実装で確認）。

- `server/utils/stroke/running.ts` は `Set<string>` 1つで、キーは `beginRun` に渡された文字列そのもの。`beginRun` / `endRun` / `isRunning` の3本
- キーを積むのは `server/api/strokes/[id]/invoke-agent.get.ts`（U13）だけで、渡す値は URL の `:id`。ストロークでは uuid、昇格後は**プロジェクト名**
- キーを読むのは `server/api/sessions/[id]/index.delete.ts`（`isRunning(sessionId)`）と `server/api/projects/[projectId]/index.delete.ts`（`isRunning(name)`）
- `server/api/strokes/[id]/approve.post.ts` は `running.ts` を import していない。docblock に「busy ガードは U7・U9 のみ。承認はエージェントの呼び出しを起動しないため対象にしない」と明記してある
- 昇格は `promoteSessionToProject`（`server/utils/stroke/project.ts`）の `rename(sessionDir, projectDir)` 1回。同じ親の下での改名で、ディレクトリの実体は移らない
- 承認は改名の後に `$fetch(invokePath(projectName, target))` で U13 を叩く。そこで `beginRun(projectName)` が積まれる

したがって、uuid で積まれた枠とプロジェクト名で積まれた枠は互いを見ない。同じ実体のディレクトリに対して2つの `claude -p` が同時に立つ。

改名を跨いだ旧プロセスがどう死ぬかも確かめた。接続表（`server/utils/mcp/connection-table.ts`）の token は実行が終わるまで残り、`resolveConnection` も `resolveConnectionSessionId`（`server/utils/mcp/require-connection.ts`）も**成功する**。落ちるのはその先で、ツールが代行先の endpoint を旧 uuid で叩き、`requireSessionId`（`server/utils/stroke/session-param.ts`）が `sessionExists` を満たさず 404「そのセッションは無い。」を返す。各ツールの写像がこれを `session_not_found` にする。`invocation` の書き込み（A8 = `submission.post.ts`）も同じ `requireSessionId` を通るので 404 で落ち、記録はどこにも残らない。

## Goals / Non-Goals

**Goals:**

- 承認の改名が、走っている呼び出しを足元から動かさないようにする
- 実行中かの判定を、**口ごとに違う単位で数え直さない**形にする（U13・U11・P1・U10 が同じ1つの事実を見る）

**Non-Goals:**

- 走っている呼び出しを承認が**中断させる**こと（止める口を新設しない）
- 承認の待ち行列・自動リトライ。承認は人の操作なので、断って人にもう一度押させる
- 接続表・MCP ツールの契約変更。旧 id を名乗る呼び出しが生まれなくなれば、`session_not_found` の経路は踏まれない
- 昇格そのものの手順（衝突確認 → 改名 → phase 書き込み → 巻き戻し）の変更。`project/generation` はそのまま

## Decisions

### D1: 走っている間の承認は「待たず、断る」

proposal は「待つか断るか」を開いている。**断る**を取る。

- 承認は人がボタンを押す操作で、応答が返るまでの間ずっと待たせる形にならない。実行は数分かかることがある（`scripts/stroke-check.ts` の 1往復上限は分単位）
- 断り方は既存の語彙で足りる。`conflict('busy', …)` は `data.reason: 'busy'` を載せ、画面は「待てば通る」と読む（`server/utils/stroke/conflict.ts`）。U11・P1 が既に同じ形で断っている
- 画面側の変更が要らない。`app/composables/useProposalReview.ts` の `approve()` は `name-conflict` と 500 だけを特別扱いし、残りは `warn('承認できませんでした', messageOf(error))` に落ちる。busy の文言がそのまま出る

**却下した案** — サーバーが実行の終わりを待ってから改名する。待ちの上限・打ち切りの扱い・その間の他の操作という新しい設計が要り、承認の応答が「受理で即完結する」（U10）性質も崩れる。

### D2: busy ガードのキーを、作業場所の**実体**にする

`running.ts` のキーを、呼び出しに使われた id ではなく、その実行の作業場所ディレクトリの実体（`stat` の `dev` と `ino` の組）にする。

- 改名は inode を保つので、`<root>/<uuid>` と `<root>/<name>` は同じキーになる。id が変わっても枠は1つ
- `beginRun` は非同期になる（`stat` を1回引く）。U13 は `requireSessionId` で実在を確かめた後に呼ぶので、対象は必ず在る
- `endRun` は `beginRun` が返したキーを使う。実行中にディレクトリが消えても解放できる
- id しか持たない口（U11・P1・U10）は「id → 保存先の下のパス → キー」で引き直す。導出は1箇所に置き、口ごとに書かない

**却下した案 (a)** — キーを正規化した絶対パス文字列にする。改名の前後で別のキーになるので、D3 の占有が正しく効いている限りでしか正しくない。「同じ物理ディレクトリを別物として扱わない」という要件を、別の仕掛けの正しさに依存させることになる。テストも、改名を跨いだ取り逃がしを直接には書けない。

**却下した案 (b)** — キーを id のままにして、承認だけが2つの id を両方見る。承認・削除・起動のそれぞれが「どの id とどの id が同じものか」を知る必要が出る。今の食い違いを増やす方向。

### D3: 承認は、確認から改名の完了までを占有する

承認が `isRunning` を見るだけでは、見た直後・改名の前に U13 が通る隙が残る。承認は**同じ枠を自分で取る**。

順序は次のとおり。

1. 対象の作業場所からキーを引く
2. `beginRun(キー)` — 既に埋まっていれば `conflict('busy', …)`。**この時点では何も変えていない**ので、セッションは元の名前・`proposed` のまま
3. 衝突確認 → 改名 → `phase` 書き込み（既存のまま。失敗時は既存の巻き戻し）
4. `endRun(キー)` — **成否によらず解放する**
5. 昇格の配信と、steering の起動（U13）

4 を 5 より先に置くのは、改名後の U13 が同じキーを取りに来るからである（inode は同じ）。解放前に叩けば自分の占有で 409 になる。

**却下した案** — 承認が枠を取ったまま steering の起動まで通し、起動側に解放させる。解放の責任が2つのモジュールに分かれ、`$fetch` が届かなかったとき（承認が既に持っている `.catch` の経路）に枠が残る。

### D4: `agent/invocation` ではなく `api/session/invoke-agent` へ delta を置く

proposal の Modified Capabilities は `agent/invocation` を挙げているが、**そこに多重起動の要件は無い**。`agent/invocation` が持つのは起動の1系統化・設定の外出し・`invocation` の4値・タイムアウト・リトライ上限で、「同一対象の多重起動を受け付けない」という SHALL は `openspec/specs/api/session/invoke-agent/spec.md` にある。U11・P1 の spec はそれを「実行中の呼び出しを持つ」と参照するだけで単位を定義していない。

単位の定義は、定義が既にある場所を直すのが正しい。`agent/invocation` に足すと、同じ規則が2つの capability に分かれる。**proposal の Capabilities 節との差分なので、ユーザーの確認を要する。**

## 上位資料への整合反映（提案 — 承認前に書き換えない）

`docs/agents/issue-tracker.md`「更新対応」に従い、提案として置く。承認を得るまで `docs/` は触らない。

1. `docs/specs/api/contract.md` の U10（162-176行）— エラーの列に `409 busy`（対象が実行中）を足す。あわせて「改名の前に実行中を確認し、確認から改名の完了までは新しい起動を受け付けない」の1行を足す
2. 同 `## 約束`（278-279行）— 「**409 (`busy`)**: そのセッションで呼び出しが実行中のときの起動（U13）と削除（U11）」を、承認（U10）を含む形に直す。**あわせて P1（プロジェクトの削除）が抜けているのも直す**——実装は既に `isRunning` で断っている（`server/api/projects/[projectId]/index.delete.ts:46`）のに、この行に載っていない
3. 同 U13（205-221行）— 「同一対象」の単位が作業場所の実体であること（id ではないこと）を1行で足す

ADR への反映は不要と判断した。ADR-0011（承認後の steering 起動）も ADR-0016 も、実行中の承認については何も決めていない。

## Risks / Trade-offs

- **`stat` が失敗する（対象が消えている・権限）** → `beginRun` の失敗としてそのまま投げる。U13 は `requireSessionId` の後、U10 は `readState` の後に呼ぶので、対象が在るのは確認済み。存在しないものを起動しない・承認しないのは今と同じ挙動
- **キーが可搬でなくなる（`dev`/`ino` はマウントとファイルシステムに依存する）** → 保持はプロセスのメモリ内だけで、永続化も他ホストとの共有もしない。再起動で全部消えるのは今と同じ
- **`beginRun` が非同期になり、呼び出し側の形が変わる** → 呼ぶのは U13 と U10 の2箇所だけ。`isRunning` を呼ぶ2箇所も同じ導出を使う形になる
- **承認が busy で断られる頻度が上がるように見える** → 実際には今まで**黙って壊れていた**ものが見えるようになるだけである。`yarn check:stroke` は既にこの状況を避けるために実行の終わりを待っている（`scripts/stroke-check.ts` の `approve()`）
- **画面の文言が汎用の「承認できませんでした」になる** → `conflict('busy', …)` のメッセージ本文が続けて出るので、待てばよいことは伝わる。専用の器を足すのは非目標

## Migration Plan

データも設定も持たない。デプロイは通常のビルドで、ロールバックは revert のみ。進行中の実行はプロセス内のメモリにしか無いので、再起動で全部消える（現状と同じ）。
