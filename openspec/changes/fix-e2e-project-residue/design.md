## Context

動機は proposal.md「Why」、事実の記録は ticket `fix-e2e-project-residue`（追記 2026-09-06）。設計に効く制約だけを挙げる。

- **承認の画面は昇格の直後に steering を起こす**（ADR 0011、`useProposalReview.ts` `promote()`）。「承認済みです」の表示は昇格の直後・起動の前に出るので、テストがその表示を見て `afterEach` に入る時刻と、`invoke-agent` が busy を立てる時刻が重なりうる
- **削除口は busy を 409 で断る**（`docs/specs/api/projects/delete.md`）。プロダクトの仕様で、テストの都合で緩めない
- **`playwright.config.ts` はモジュール本体で種をまき、worker プロセスでも評価される**（`update-e2e-harness` ticket 訂正4）。ここに「消す」処理を置くと、worker の評価で種をまいた後の保存先を消す
- **単発では再現しない。** 同じ手順の probe で DELETE は +200ms で 204 だった。残骸は full run の条件でしか出ていない。busy との競合か、run の中断（afterEach を通らない）かは未確定
- `update-e2e-harness`（Planning）が同じ `playwright.config.ts` と `tooling/e2e-harness` に触る

## Goals / Non-Goals

**Goals:**
- 残骸が出た run の中で、どのテストがどの応答で消せなかったかが結果に出る
- 前の run が何を残していても、次の run は同じ保存先から始まる

**Non-Goals:**
- 削除口・承認・起動の仕様を変えること
- 削除が断られる原因への対処（実行終了を待つ等）。原因が未確定なので、握り潰しを外した full run で応答を見てから別途決める
- E2E の速さ、worker の並列化（`update-e2e-harness`）

## Decisions

### D1: 後始末の失敗は `afterEach` の中で throw し、そのテストを落とす

`afterEach` の `.catch(() => undefined)` を外し、応答が 2xx 以外なら対象・status・本文を含む `Error` を投げる。Playwright は hook の失敗をそのテストの失敗として報告する。セッションの削除（`created` の loop）も同じ扱いにする——握り潰しの形が同じで、残れば同じ症状を起こす。

- 代替: `afterAll` でまとめて1件落とす — どのテストが残したかを自分で束ねる必要があり、本体が緑のまま末尾で赤になる形は読みにくい
- 代替: `console.warn` だけ — 発覚の遅さが今と変わらない

404（既に無い）は失敗にしない。ただし**削除の直前に `GET /api/strokes/:name` で対象が在ることを確かめた後だけ**そう読む。GET が 404 なら対象は無いので削除しない。導出した `projectId` が違って 404 になる場合を緑で隠さないため。

### D2: 保存先の初期化は config のトップレベルに置き、本体プロセスの評価に限定する

`playwright.config.ts` の種まきの直前で `E2E_ROOT`（`.e2e-tmp`）を丸ごと消す。ただし **`TEST_PARALLEL_INDEX` が無いときだけ**——この環境変数は worker プロセスの入口（`playwright/lib/worker/workerProcessEntry.js:1366`）でだけ立ち、本体プロセスには無い（`update-e2e-harness` ticket 訂正3 と同じ手がかり）。種まきは関数（`seedStore`）に切り出し、トップレベルから呼ぶ。

> **2026-09-06 に置き場を改めた。** 当初は `globalSetup` に置く設計だったが、実装時に Playwright の順序を確かめたところ、**`webServer`（plugin setup）が `globalSetup` より先に走る**（`playwright/lib/runner/index.js:6003-6009` `createGlobalSetupTasks`）。サーバが立った後に消すと、まき直すまでの隙間にサーバ（300ms ごとの registry 同期・要求ごとの走査）が空の保存先を読み、最初のテストが flake しうる。config の評価はサーバの起動より前なので、隙間が無い。

- 代替: `globalSetup` で消してからまき直す — 上の順序の問題。却下
- 代替: config のトップレベルで無条件に消す — worker でも評価されるので、worker の起動のたびに保存先が消えて作り直される。1 worker の今は害が出ないが、worker を増やすと壊れる。guard で本体プロセスに限定することで解消
- 代替: `globalTeardown` で消す — 途中で落ちた・強制終了した run の残骸が残る。調べたい残骸は消える
- 代替: 名前の規約（`e2e-` 始まり）で選んで消す — 規約から外れた残骸を見逃す

`refuseRealTargets()` の検査は今のまま通す。消す対象が `E2E_ROOT` の下であることは、その検査（`:134-139`）が保証している。

### D3: 原因の確定は tasks の中で full run を回して取る

握り潰しを外した状態（D1）で `yarn test:e2e` を1回回し、`proposal-persistence.spec.ts` の結果をそのまま記録にする。緑なら残骸は run の中断由来で、D2 が既に手当てしている。赤なら出た status と本文を ticket に追記し、対処は別途決める。この change はそこで止める。

## Risks / Trade-offs

- [D1 で full run が赤になる] → それが狙い。残骸の原因が結果に出る。D2 が入っているので次の run は壊れない
- [D2 の guard が効かず worker でも消す] → worker では `TEST_PARALLEL_INDEX` が必ず立つ（Playwright の入口で設定）。立たない環境は本体プロセスだけで、そこで消すのが狙い
- [`update-e2e-harness` が種まきを fixture へ移す] → 種まきを関数に切り出しておくことが、あちらの移行を楽にする。「消す」は本体プロセスで1回の処理なので、worker 単位の土台になっても残る
