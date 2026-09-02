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

- **`Phase` に `activated` を足す。** steering の**初回の承認依頼が提出された**ときに書く。ここから先が、本当の意味でプロジェクトインスタンスが準備された状態である
- **`activated` を書く endpoint をサーバに足す。** 提出を受けて立てる
- **`invocation` から失敗の応答を出せるようにし、WS の通知パターンに失敗を入れる。** claude の処理がエラーなら、ユーザー側にプロジェクト作成失敗のアクションを出す

始点（`approved`）と終点（`activated`）が確定した1点になるので、**生成中の判定が区間の内外だけになる**。走査（`.spec-workflow` の有無）もプロセスの状態（`invocation`）も見ない。

### なぜ両端を書き込みにするか

承認から steering の初回の承認依頼までの間、**成功するか失敗するかがまだ分からない**。この未確定の期間を含めて「生成中」を安定して判定する方法が見つからなかった。走査もプロセスの状態も、途中で連続的に変わるので境界が引けない。

両端を1点ずつの書き込みにすれば、境界が定義になる。

### 対象外

- `/write-steering-v2` が存在しない件（[`fix-missing-write-steering-skill`](../../tickets/fix-missing-write-steering-skill.md)）。スキルを置くのはあちらの仕事である。**この change が受け持つのは、スキルの有無にかかわらず、steering の作成が完了しなかったときにプロジェクトの生成が失敗したという状態が現れること**である
- 承認 endpoint が3つの仕事を1回でやっている件（`separate-approval-decision-from-promotion`）。段の分割はこの change では扱わない

## Capabilities

### New Capabilities

- `api/session/activate`: 昇格した対象を、steering が成果物を出し終えた状態にする endpoint（U15）。成果物の有無を確かめてから立てる。起動も判断も昇格も受け持たない

### Modified Capabilities

- `project/generation` — 生成の決着の判定と、その配信

**追記 2026-09-02。** 起票の時点では「`activated` を立てる endpoint をサーバに足す」としか書いておらず、その endpoint を capability として立てていなかった。`separate-approval-decision-from-promotion` が develop へ入り、**承認の各段がそれぞれ capability を持つ形**（`api/session/approve` / `api/session/promote`）になったため、完成の記録も同じ形で並べる（design.md D4）。

## Impact

| ファイル | 内容 |
| --- | --- |
| `shared/stroke.ts` | `Phase` に `activated` を足す。値の一覧を1つ持つ形にする |
| `server/handler/phase.ts` | **没にする。** 生読みの `readPhase` と承認軸の述語（`isBeforeApproval` / `isAfterApproval`）をやめる |
| `server/api/sessions/[id]/index.delete.ts` / `server/api/projects/[projectId]/index.delete.ts` | `handler/phase.ts` の代わりに `readState` で phase を読み、受理範囲を自分で持つ |
| `server/utils/stroke/session-core.ts` | **もう1つの `readPhase`**（起票時に数えていなかった5箇所目） |
| `server/utils/stroke/session-store.ts` | zod の枝、`creationOutcomeOf` の判定 |
| `server/utils/control/creating.ts` | `phase` を持ち帰る（いまは `approved` かの真偽だけ） |
| `server/utils/control/directory.ts` | 行の `creation` を phase から引く。生成中を接続の判定から外す |
| `server/api/strokes/[id]/activate.post.ts`（新規） | `activated` を立てる endpoint（U15） |
| `server/api/strokes/[id]/invoke-agent.get.ts` | 起こす定型と `runId` の選び分けに `activated` を通す |
| `server/utils/stroke/ai.ts` | 成功の分岐から U15 を叩く。steering にも `didWork` を渡す |
| `server/plugins/` | 既存の `state.json` を一度だけ書き上げる（design.md D7） |

### phase の値がばら撒かれている現状

phase の値の集合と、`state.json` から phase を読む処理が、それぞれ複数箇所にある。

```
shared/stroke.ts            型のユニオン3本
handler/phase.ts            readPhase（生読み）の `=== 'stroking' || === 'proposed' || === 'approved'`
session-core.ts             もう1つの readPhase（生読み）。同じ連鎖で、外れた値を 'unknown' に倒す
session-store.ts            zod の literal 3本（readState）
session-store.ts            creationOutcomeOf の `phase !== 'approved'`
```

`handler/phase.ts` はこの change で没にする（上の Impact）。`docs/specs/api/projects/delete.md` が「どの局面のものを許すかは各 endpoint が持つ」と定めているのに、承認を軸にした述語を endpoint の外に置き、zod を通さない読みを増やしているためである。

イコール比較を各所へ足していく形は取らない。値は `shared/stroke.ts` に1つ置き、読みは `readState` に1本化する。

## 決定の記録

| 日付 | 決定 |
| --- | --- |
| 2026-08-31 | **完了の根拠は成果物であって、プロセスの終了ではない。** claude が正常終了しても成果物が無ければ完了ではない |
| 2026-08-31 | **行と配信は同じ根拠を見る。** 走査とプロセスという別々の材料を使うのをやめる |

## 誰が、いつ、どう書くか

```
誰が   invokeAi。claude のプロセスを終了まで握っている
いつ   プロセスが終わり、結果を判定した時点
どう   承認 API を phase 付きで叩く。新規 endpoint を生やさない
失敗   同じ分岐で invocation に失敗を立て、WS の通知パターンに失敗を乗せる
```

`invokeAi` は既に成功・失敗の分岐を両方持っている（`ai.ts:112-141`）。**その先に「API を叩く」を足すだけ**で、新しい判定を作らない。

### 書くのが「提出の瞬間」でなくてよい理由

境界の確定性は、書くタイミングではなく**書き込みが1点であること**から来る。プロセス終了後に書いても、区間がわずかに伸びるだけで、`approved` と `activated` の2点で挟まれる構造は変わらない。

### `didWork` では足りない理由

`didWork` は既にある（`invoke.ts:148`、ストローク側のみ。steering には渡っていない）。しかしその結果は `invocation` へ書かれる。

```
invocation   running / idle / failed / error
             上書きされる。ライフサイクルの記録にならない
             idle は「終わった」であって「できた」ではない
phase        消えない。区間の端として残る
```

**同じ判定でも、行き先が `invocation` か `phase` かで意味が変わる。** `didWork` を steering にも渡せば失敗は拾えるようになるが、それだけでは「完成した」を記録する場所が無いままで、境界は引けない。`activated` が要るのはそのためである。

### 承認 API が phase を受け取る形について

ADR-0014「API は暗黙の状態分岐を持たない」は、**判定の材料が契約から読めるか**を分かれ目にしている。phase を引数として外に出す形は、同 ADR が対象外とする「引数で制御される分岐」に当たる。

ただし呼び出し側が任意の phase を書けると、遷移の正しさを API が保証しなくなる。**受け取れる遷移を限る**か、**遷移そのものを引数にする**かは design で決める。

## 未決

**「初回の」をどう見分けるか。** 2回目以降に `activated` を書き直しても実害は無いが、何を以て初回とするかは決めておく。
