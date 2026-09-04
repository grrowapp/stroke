## Why

**プロジェクトの完成を、誰も記録していない。**

承認するとプロジェクトの実体はできるが、その先で steering が成果物を出したかどうかを持つ場所が無い。`Phase` は `stroking` / `proposed` / `approved` の3つで終わっていて、`approved` が終着になっている。

そのため、行と配信が**別々のものを測って両方 `done` と名乗っている**。

```
行（一覧）   creation: 'done'   走査で .spec-workflow が有った
配信（決着） 'done'             invocation === 'idle'
```

`invocation` は「claude のプロセスがどうなったか」しか表さない。実測 2026-08-30、`/write-steering-v2` が存在せず claude が `Unknown command` を返して**正常終了**したところ、`invocation` は `idle` になり、**成果物ゼロのままクラッカーが上がって「レビューする」が押せる状態**になった（`/opt/projects/setai-2`: `phase: approved` / `invocation: idle` / `.spec-workflow/steering` 0件）。

`invocation` を行の判定から追い出したときに、配信側を揃えないまま残したのが直接の原因である（`session-store.ts` の「`invocation` を合図の材料に使っても、行の判定が `invocation` に依存することはない」というコメントが、その半端な状態を追認している）。

根の原因は、**両方が見るべき状態が存在しない**ことである。無いから片方はファイルシステムを、片方はプロセスを見に行った。

## What Changes

**生成中の両端を、明示的な書き込み1点ずつにする。**

```
approved ──────────── 生成中 ────────────> activated
 [承認後]                                    [提出後]
    ↑                                           ↑
 何かが書く                                 何かが書く
```

- **`Phase` に `activated` を足す。** steering の**初回の生成が終わった**——その起動で steering 文書の提出が本家に受理された——ときに書く。ここから先が、本当の意味でプロジェクトインスタンスが準備された状態である
- **`activated` を書く endpoint をサーバに足す。** 呼び手の判定を受けて立てる。**この endpoint は判定を持たない**（下「U15 と ADR-0014 の関係」）
- **成功の決着を A8 から U15 へ移す。** いまは A8 の実体 `writeInvocation` が「`approved` で `idle` になった」瞬間に `done` を流しており、実行の記録の口が完成の合図を兼ねている。これをやめ、`done` は U15 だけが流す。失敗の決着（`error` → `failed`）は今の経路のまま残す。画面側（知らせる面・モーダル・やり直す・破棄する）は実装済みで、変えない

始点（`approved`）と終点（`activated`）が確定した1点になるので、**生成中の判定が区間の内外だけになる**。走査（`.spec-workflow` の有無）もプロセスの状態（`invocation`）も見ない。

### なぜ両端を書き込みにするか

承認から steering の初回の生成が終わるまでの間、**成功するか失敗するかがまだ分からない**。この未確定の期間を含めて「生成中」を安定して判定する方法が見つからなかった。走査もプロセスの状態も、途中で連続的に変わるので境界が引けない。

両端を1点ずつの書き込みにすれば、境界が定義になる。

### 対象外

- `/write-steering-v2` が存在しない件（[`fix-missing-write-steering-skill`](../../tickets/fix-missing-write-steering-skill.md)）。スキルを置くのはあちらの仕事である。**この change が受け持つのは、スキルの有無にかかわらず、steering の作成が完了しなかったときにプロジェクトの生成が失敗したという状態が現れること**である
- 承認 endpoint が3つの仕事を1回でやっている件（`separate-approval-decision-from-promotion`）。段の分割はこの change では扱わない
- 「その実行で作業が行われたか」（`didWork`）の判定そのもの（`fix-steering-empty-completion`、実装済み・archive 前）。あちらは `agent/invocation` の同じ Requirement「完了は output stream で検知して idle に変える」を MODIFIED しており、後に archive した方が main を上書きする。**この change の delta はあちらの文を含めて書いてあるので、archive はあちらを先にする。** あちらの ADDED Requirement「作業が行われたかの判定を工程ごとに持つ」はあちらに残し、ここへ写さない

## Capabilities

### New Capabilities

- `api/session/activate`: 昇格した対象を、steering が成果物を出し終えた状態にする endpoint（U15）。**完成したかの判定は持たない**——呼び手が決めたことを記録するだけである。起動も判断も昇格も受け持たない

### Modified Capabilities

- `project/generation` — 生成中か完了かの判定を phase だけにする。`.spec-workflow/` の有無を判定から外す。既存の昇格済みプロジェクトの起動時の記録し直し
- `agent/invocation` — 承認以降の局面に `activated` を含める。生成中の steering の完了時に完成の記録を試み、受理されなければ `failed` にする
- `api/session/get` — 返す phase の値に `activated` を足す
- `stroke/frontier` — 保持する phase の値に `activated` を足す
- `project/directory` — 生成中の定義を「昇格したが `.spec-workflow` をまだ持たない」から phase（`approved`）へ改める。走査は母集合にだけ使う。生成中の行を接続の判定から外す理由を「まだ `.spec-workflow` を持たず登録されようがない」から「phase が生成中である」へ移す（`.spec-workflow` は本家 MCP の接続時にでき、registry にも載る）。**delta は未作成**
- `api/project/delete` — 「中身のある本物のプロジェクトは消さない」の根拠を `.spec-workflow/` の有無から phase（`activated`）へ移す。接続時に `.spec-workflow/` ができた作りきれなかったプロジェクトを「破棄する」で消せるようにする。**delta は未作成**
- `api/session/answer` — 回答を受理しない局面を「`approved`」から承認以降（`approved` / `activated`）へ広げる。**delta は未作成**

**追記 2026-09-02。** 起票の時点では「`activated` を立てる endpoint をサーバに足す」としか書いておらず、その endpoint を capability として立てていなかった。`separate-approval-decision-from-promotion` が develop へ入り、**承認の各段がそれぞれ capability を持つ形**（`api/session/approve` / `api/session/promote`）になったため、完成の記録も同じ形で並べる。

## Impact

| ファイル | 内容 |
| --- | --- |
| `shared/stroke.ts` | `Phase` に `activated` を足す。値の一覧を1つ持つ形にする |
| `server/handler/phase.ts` | **没にする。** 生読みの `readPhase` と承認軸の述語（`isBeforeApproval` / `isAfterApproval`）をやめる |
| `server/api/sessions/[id]/index.delete.ts` / `server/api/projects/[projectId]/index.delete.ts` | `handler/phase.ts` の代わりに `readState` で phase を読み、受理範囲を自分で持つ。P1 の「本物は消さない」の根拠を `.spec-workflow/` の有無から `activated` へ移す |
| `server/utils/stroke/session-core.ts` | **もう1つの `readPhase`**（起票時に数えていなかった5箇所目） |
| `server/utils/stroke/session-store.ts` | zod の枝。`creationOutcomeOf` から `idle → done` を外し、`error → failed` だけ残す（`done` は U15 が流す） |
| `server/utils/control/creating.ts` | `phase` を持ち帰る（いまは `approved` かの真偽だけ）。`state.json` を zod を通さず生読みしている点も `readState` へ寄せる |
| `server/utils/control/directory.ts` | 行の `creation` を phase から引く。生成中を接続の判定から外す（registry に載っていても `active` にしない） |
| `server/api/strokes/[id]/answer.post.ts` | `phase === 'approved'` の門を承認以降へ広げる（起票時に数えていなかった6箇所目。いまは `activated` が素通りして「答えるべき問いが無い」の 409 に落ちる） |
| `server/api/sessions/[id]/activate.post.ts`（新規） | `activated` を立てる endpoint（U15、`POST /api/sessions/:id/activate`）。`done` を流すのはここ |
| `server/api/sessions/[id]/invoke-agent.get.ts` | 起こす定型と `runId` の選び分けに `activated` を通す。実装はいま `server/api/strokes/[id]/` に置かれているが、docs の定義は `/api/sessions/` である（ticket「見つけた課題」） |
| `server/utils/stroke/ai.ts` | 作業ありの分岐から U15 を叩く。steering の `didWork` は `fix-steering-empty-completion` で既に渡っている |
| `server/plugins/` | 起動時に一度だけ、`approved` の対象それぞれに U15 を叩いて既存の `state.json` を書き上げる |

### phase の値がばら撒かれている現状

phase の値の集合と、`state.json` から phase を読む処理が、それぞれ複数箇所にある。

```
shared/stroke.ts            型のユニオン3本
handler/phase.ts            readPhase（生読み）の `=== 'stroking' || === 'proposed' || === 'approved'`
session-core.ts             もう1つの readPhase（生読み）。同じ連鎖で、外れた値を 'unknown' に倒す
session-store.ts            zod の literal 3本（readState）
session-store.ts            creationOutcomeOf の `phase !== 'approved'`
creating.ts                 isApproved（生読み）の `phase === 'approved'`
answer.post.ts              回答を断る門の `phase === 'approved'`
```

`handler/phase.ts` はこの change で没にする（上の Impact）。`docs/specs/api/projects/delete.md` が「どの局面のものを許すかは各 endpoint が持つ」と定めているのに、承認を軸にした述語を endpoint の外に置き、zod を通さない読みを増やしているためである。

イコール比較を各所へ足していく形は取らない。値は `shared/stroke.ts` に1つ置き、サーバ層の読みは `readState` に1本化する。Nitro を持てない core 層（`session-core.ts`）の一覧用の軽い読みだけは残し、値の判定を `shared/stroke.ts` の集合から引く（design D6）。

## 決定の記録

| 日付 | 決定 |
| --- | --- |
| 2026-08-31 | **完了の根拠は成果物であって、プロセスの終了ではない。** claude が正常終了しても成果物が無ければ完了ではない |
| 2026-08-31 | **行と配信は同じ根拠を見る。** 走査とプロセスという別々の材料を使うのをやめる |
| 2026-09-04 | **U15 は状態を判定しない**（ADR-0014）。**完成の判定は invokeAi の `didWork`**——その起動で steering 文書の提出が本家に受理されたか——であり、**承認依頼は根拠にしない**。steering 工程には承認依頼を出す手段が無く、根拠にした結果、文書を出し終えた実行が 409 で断られて `failed` → `error` に倒れた（実機確認） |

## 誰が、いつ、どう書くか

```
誰が   invokeAi。claude のプロセスを終了まで握っている
いつ   プロセスが終わり、その起動で作業が行われたと判定した時点
判定   invokeAi の didWork（その起動で steering 文書の提出が本家に受理されたか）
どう   U15 POST /api/sessions/:id/activate を叩く。U15 は判定せず phase を書くだけ
失敗   U15 が受理しなければ invocation を failed に立て、巡回の起こし直しに回す
```

`invokeAi` は既に「作業が行われたか」の分岐を持っている（`ai.ts` の `runBuiltInvocation` の `didWork`）。**その分岐の作業ありの側に「U15 を叩く」を足すだけ**で、新しい判定を `invokeAi` に作らない。判定は既に在る `didWork` の1箇所で、U15 の側には置かない。

起動時の書き上げ（導入前に生成を終えていたものを畳む一度きりの処理）も同じ形で、判定はそちらが持つ——一覧が返す実行の記録（`invocation: 'idle'`）で対象を選ぶ。

起票時の tasks が書いていた「新規 endpoint を生やさない」は、U10 が唯一の phase 書き込み endpoint だった時点の前提である。3段化で段ごとに endpoint を持つ形になったので、完成の記録も1本の endpoint で受ける。

### 書くのが「提出の瞬間」でなくてよい理由

境界の確定性は、書くタイミングではなく**書き込みが1点であること**から来る。プロセス終了後に書いても、区間がわずかに伸びるだけで、`approved` と `activated` の2点で挟まれる構造は変わらない。

### `didWork` では足りない理由

`didWork` は既にある（`invoke.ts`。`fix-steering-empty-completion` で steering にも渡り、その起動で文書の提出が本家に受理されなければ `failed` になる）。**判定としてはこれで足りる**——2026-09-04 の決定で、完成の判定はこの `didWork` そのものになった。足りないのは**判定ではなく行き先**である。

```
invocation   running / idle / failed / error
             上書きされる。ライフサイクルの記録にならない
             idle は「終わった」であって「できた」ではない
phase        消えない。区間の端として残る
```

**同じ判定でも、行き先が `invocation` か `phase` かで意味が変わる。** `didWork` の結果は `invocation` へ書かれ、次の起動で上書きされる。行き先が `invocation` である限り「完成した」を記録する場所は無く、境界は引けない。`activated` が要るのはそのためである——**`didWork` が判定になり、`phase` がその記録になる。**

### U15 と ADR-0014 の関係

ADR-0014「API は暗黙の状態分岐を持たない」は、**判定の材料が契約から読めるか**を分かれ目にしている。U15 は引数を取らず、**完成したかの判定を持たない**。見るのは受け取った id に対して責務が成立するか——対象が存在するか、`state.json` を読めるか、phase が `approved` か——だけで、これは同 ADR が対象外とする「責務の不成立」の分岐である。成果物・ファイルシステム・本家 REST・`invocation` はどれも呼び出し側が渡していない内部状態なので、受理の可否の材料にしない。phase を引数で受け取る形も取らない——呼び出し側が任意の phase を書けると、遷移の正しさを API が保証しなくなる。

### 「初回の」の見分け方

`activated` は一方向の遷移で、U15 は対象が `approved` のときだけ立てる。`activated` の対象への U15 は受理しない。完成済みプロジェクトの steering を起こし直しても、完了時に U15 は呼ばない（`recordCompletion` を渡すのは `phase === 'approved'` のときだけ）。これで「初回」は定義から決まる。

## 競合の棚卸し（2026-09-02、この change を正とする）

完成の判定に近い役割を、既に別の場所が持っている。設計の経緯が資料に残っていないものは、**この change を正として取り込み、規定を1箇所にする**。specs の重複は残さない。

| 場所 | いまの役割 | この change での扱い |
| --- | --- | --- |
| A8 `submission.post.ts` → `writeInvocation` → `creationOutcomeOf` | `approved` で `idle` を書いた瞬間に `done` を流す。**実行の記録の口が成功の決着を兼ねている** | `done` を外す。成功の決着は U15 だけが流す。`error → failed` は残す |
| `directory.ts` の `creation` | 走査で `.spec-workflow` が有れば `done`、`creating.ts` から来た昇格済みは `in-progress` | phase から引く。`.spec-workflow` は母集合にだけ使う |
| `creating.ts` の `isApproved` | `state.json` を生読みし `approved` かの真偽だけ返す | phase を持ち帰る。読みは `readState` へ |
| `fix-steering-empty-completion` の `didWork`（steering） | 文書を1本も提出しない実行を `failed` に倒す | 残す。完成の記録とは別の判定として、この change の delta に文ごと含める（上「対象外」） |
| `openspec/specs/project/directory` | 生成中を「`.spec-workflow` をまだ持たない」で定義し、接続の判定から外す理由も同じ | MODIFIED delta を足す（未作成）。`project/generation` の delta は directory を参照し、規定を写さない |
| `openspec/specs/api/project/delete` | `.spec-workflow/` を持つものは消さない | MODIFIED delta を足す（未作成）。根拠を `activated` へ |

### 上位資料への整合反映（apply で行う）

`docs/agents/issue-tracker.md`「更新対応」により、**design.md で提案してユーザーの承認を得てから書き換える**。ticket「上位資料との食い違い」の表に、棚卸しで見つけた分を足したものが宛先である。

| 資料 | 直す点 |
| --- | --- |
| `docs/specs/api/contract.md` | U2 / U12 の phase の値に `activated` を足す。A8 の説明に「成功の決着は流さない」を足す |
| `docs/specs/api/overview.md`・`sessions/` | U15 を目録と個別ファイルに足す。U13 の定型の選び分けに `activated` を通す |
| `docs/specs/api/ws/delivery.md` | `project-creation` の `done` の出どころを「実行の完了」から「完成の記録（U15）」へ |
| `docs/specs/api/projects/delete.md` | 「`.spec-workflow/` を持つものは拒否する」を「`activated` は拒否する」へ。「生成中・失敗した行は本家に登録されておらず」は事実と違う（接続時に載る）ので直す |
| `CONTEXT.md`「生成中」 | 「終わりは `.spec-workflow/` が出来たとき」を「終わりは完成の記録（steering が文書を出し終えたこと）」へ。定義本体は変えない |
| `docs/specs/plan/portal-stroke-exit.md` | 図の「`.spec-workflow/` ができる → 実行が終わったら done を配信」を U15 経由へ |
