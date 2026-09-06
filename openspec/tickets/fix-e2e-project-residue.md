---
status: Doing
change: fix-e2e-project-residue
origin: agent
tags:
  - proposal
  - design
  - specs
  - tasks
  - pre3/2a613278-0550-454b-bf46-2c504945f035
order: -11.0
triage:
  - bug
date: 2026-09-04
---

# fix-e2e-project-residue

E2E が作った承認済みプロジェクトが `.e2e-tmp/projects/` に残り続け、**次の実行から
`projects.spec.ts` を壊す**。後始末のコードは既に在り、この失敗モードまでコメントで
予告されている。にもかかわらず残る——つまり掃除の書き忘れではなく、**後始末が効いて
いないのに失敗が握り潰されている**のが本体である。

## 事実（2026-09-04）

`test/e2e/proposal-persistence.spec.ts:82`「承認は proposal が無いことを理由に拒まない」が
`e2e-proposal-approved-${Date.now()}` という名前でプロジェクトを作る。固定名にすると2回目の
実行が名前衝突で落ちるため、走るたびに違う名前になる（同ファイル 85-87 行のコメント）。

後始末は同ファイルの `afterEach`（54-67 行）に在り、`promoted` に積んだ名前から `projectId` を
導出して `DELETE /api/projects/:projectId` を叩く。その直前のコメント（48-50 行）は、残した
場合に何が起きるかをそのまま書いている。

> 残すと、承認済み（`phase: 'approved'`）で `.spec-workflow` を持たないディレクトリが
> 保存先に居座り、**次の実行から一覧に「生成中」として出る**（specs/project/directory）。
> それが他の spec の行数を狂わせる。

**予告どおりのことが起きている。** 2026-09-04 時点で `.e2e-tmp/projects/` に2件が残っていた。

| 残っていたもの | 作られた run |
| --- | --- |
| `e2e-proposal-approved-1788352484619` | 2026-09-02 |
| `e2e-proposal-approved-1788498695889` | 2026-09-04 |

この2件が一覧に「生成中」として並び、`projects.spec.ts` の3件が落ちる。

| 落ちるもの | 期待 | 実際 |
| --- | --- | --- |
| `projects.spec.ts:11:3` 走査で見つかったプロジェクトが並ぶ | 3行 | 5行 |
| `projects.spec.ts:16:3` アクティブが上、未接続が下に並ぶ | `[active, active, disconnected]` | `disconnected` が2つ余る |
| `projects.spec.ts:24:3` 同じ区分の中では名前順に並ぶ | `[alpha, beta, idle-project]` | 同上 |

失敗時の DOM（`test-results/.../error-context.md`）に、余分な2行が
`cell "e2e-proposal-approved-1788352484619" / 状態 "生成中"` として並んでいることを確認した。
2件を手で消して再実行すると `projects.spec.ts` は 19 passed になる。

**full run のたびに1件ずつ増える。** 放置すると期待値との差が開き続ける。

## 見当をつけたところ（未確定）

- 削除口 `server/api/projects/[projectId]/index.delete.ts` は**実在する**。`projectId` の導出
  （sha1 → base64url → 先頭16文字）もテスト側と一致しており、口が無いわけではない
- その口は busy（`isRunning`）・phase・`.spec-workflow` の3条件で 409 / 404 を返しうる。
  `afterEach` の時点でセッションがまだ動いていれば `busy` で弾かれる筋がある
- `afterEach` の `request.delete(...).catch(() => undefined)` が**失敗を握り潰している**ため、
  弾かれた事実がログにもテスト結果にも出ない。今回の発覚が遅れた直接の原因はこれである
- `playwright.config.ts` の `refuseRealTargets()` は保存先が `.e2e-tmp` の外を指していないかを
  検査するだけで、中身は消さない（134-139 行）。全体の掃除役はどこにも居ない

## 畳む方向

1. `afterEach` の削除がなぜ効かないかを突き止めて直す（口が弾いているのか、届いていないのか）
2. **後始末の失敗を握り潰さない。** 消せなかったことが実行結果から分かる形にする
3. 既に残っている残骸を片付ける手立てを持たせる。1回の取りこぼしが以後の全 run を壊す作りを
   やめ、実行の前後どちらかで保存先が既知の状態から始まるようにする

## 経緯

[[fold-stroke-css]] の tasks 5.4（`yarn test:e2e` が通ること）で full run を回したときに発覚した。
その change は CSS の置き場を畳むだけで、プロジェクトの行数に関わらない。切り分けの結果、
失敗5件のうち3件がこの残骸、残り2件は flake（再実行で通過）であることが分かったため、
`fold-stroke-css` からは切り出してここへ置く。

`fold-stroke-css` の作業中に残骸2件は手で消してあるので、**今の `.e2e-tmp/projects/` は
きれいな状態**である。次に full run を回した時点でまた1件増える。

## 関連

- [[update-e2e-harness]] — E2E の遅さを土台の作りから直す ticket。保存先の扱いに触るなら
  範囲が重なる可能性がある

## 追記（2026-09-06）

change の artifact 作成に着手する前の読み直しと再現で分かったことを記す。**本節と
「見当をつけたところ」が食い違う箇所は本節が正**である。

> 2026-09-06 に change ディレクトリと本 ticket が親から消えていたため、同日に両方を起票し直した
> （issue-tracker「同時の起票は必須」）。本文は起票時（2026-09-04）の記録をそのまま写している。

### 訂正1: 削除口が見るのは busy・`state.json`・phase の3つで、`.spec-workflow` は見ない

現行の `server/api/projects/[projectId]/index.delete.ts` は、`isRunning` なら 409 busy →
`readState` で読めなければ 409 phase → `phase` が `approved` 以外なら 409 phase、の順で断る。
`.spec-workflow/` の有無は見ない（`docs/specs/api/projects/delete.md`「根拠は phase であって
`.spec-workflow/` の有無ではない」）。見当の「3条件」のうち `.spec-workflow` は現行には無い。

### 事実: 画面の承認は3段で、「承認済みです」は steering の起動より前に出る

`app/composables/useProposalReview.ts` の `promote()` は、U14（昇格）が成功すると
`phase.value = 'approved'` を書き——ここで「承認済みです」が表示される——続けて
`kickSteering`（`GET /api/strokes/:name` → `GET .../invoke-agent`。busy はここで立つ）を待ち、
最後に `/projects` へ遷移する。テストは表示を見た直後に afterEach へ入るので、**DELETE は
steering の起動と同じ時刻に届く**。重なれば 409 busy で弾かれる筋である。

### 事実: 単発では再現しない（2026-09-06、pre3、probe 1本）

同じ手順を1本の spec に写し、表示の直後に何も挟まず DELETE を送った。**+200ms で 204**、
ディレクトリは消え、残骸は出なかった。サーバログには `/bin/true` の実行が
「応答が成功として読み取れない」（`server/utils/stroke/claude.ts:228`）で `failed` に倒れた
記録があり、E2E の steering は起動から終了まで 200ms に満たない。単発では DELETE と重ならない。

したがって残骸は **full run の条件でしか出ない可能性がある**——実行順（`projects.spec.ts` →
`proposal-persistence.spec.ts` → `stroke-exit.spec.ts`）、先行 spec が残した状態、60秒ごとの
巡回（`server/plugins/01.retry-failed.ts`）、負荷による steering の伸び。**full run での再現は
未実施。** 単発の probe は busy の筋を否定しておらず、確定もしていない。

### 事実: 保存先を既知の状態へ戻す仕組みは無い

`playwright.config.ts` の種まき（`:188-216`）は mkdir と writeFile だけで、消す処理を持たない。
`.e2e-tmp` を消すのは `package.json` の `clean` だけである。config のトップレベルは worker
プロセスでも評価される（[[update-e2e-harness]] 訂正4）ので、消す処理を config のトップレベルに
置くと種をまいた後に worker がもう一度消す。置き場は `globalSetup` になる。

### 畳む方向（更新）

1. **原因の確定は full run で取る。** 単発では出ないので、afterEach の握り潰しを外した状態で
   full run を回し、DELETE の応答をそのまま記録にする
2. 変わらず。消せなかったテストは、DELETE の status と本文をメッセージに載せて**赤にする**。
   セッションの削除（`created` の loop）の `.catch(() => undefined)` も同じ扱いにする
3. **実行の最初に `.e2e-tmp` を丸ごと消してから種をまく**（`globalSetup`）。前回の残骸は次の
   run に影響せず、落ちた run の残骸は次の run まで残るので調べられる

決め（エージェント判断、2026-09-06）: [[update-e2e-harness]] とは独立に小さく進め、先に develop へ
入れる。spec は同 change が新設する `tooling/e2e-harness` と同じ path に requirement を足す。

決め（ユーザー、2026-09-06）: **最小構成で進める。** 上の 2（握り潰しを外す）と 3（既知の保存先から
始める）だけを入れる。削除が断られる原因への対処（実行終了を待つ等）は、握り潰しを外した full run で
応答を見てから別途決める。これはプロダクトの不具合ではなくテスト土台の保守であり、優先度は高くない。
