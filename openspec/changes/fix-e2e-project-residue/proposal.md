## Why

E2E の `proposal-persistence.spec.ts` が承認で作ったプロジェクトが `.e2e-tmp/projects/` に残り、次の run から一覧に「生成中」として並んで `projects.spec.ts` の3件を落とす。後始末（`afterEach` の `DELETE /api/projects/:projectId`）は在るのに効いておらず、その失敗を `.catch(() => undefined)` が握り潰しているため、発覚が次の run まで遅れる。full run のたびに1件ずつ増え、手で消すまで2回目以降の full run は落ち続ける（ticket `fix-e2e-project-residue`）。

プロダクトの不具合ではない。削除口は仕様どおりに動いている。壊れているのはテストの土台の後始末だけで、直すのも `test/e2e/` と `playwright.config.ts` に閉じる。

## What Changes

- **後始末の失敗を握り潰さない。** `proposal-persistence.spec.ts` の `afterEach` で、セッションの削除・プロジェクトの削除が受理されなかったとき、その status と本文をメッセージに載せて**そのテストを落とす**。残骸を作った run の中で分かるようにする
- **実行は既知の保存先から始まる。** `playwright.config.ts` の種まきの直前に `.e2e-tmp` を丸ごと消す。消すのは本体プロセスの評価だけ（worker プロセスでも評価されるため、worker では消さない）。前回の残骸は次の run に影響せず、落ちた run の残骸は次の run まで残るので調べられる
- **原因の確定は full run で取る。** 単発の再現では DELETE が 204 で通り残骸は出なかった（ticket 追記 2026-09-06）。握り潰しを外した状態で full run を回し、DELETE の応答をそのまま記録にする。断られる理由が出たら、その対処（実行終了を待つ等）は事実を見てから別途決める

変えないもの: `DELETE /api/projects/:projectId` の仕様（busy・phase で断る）。テストの都合で口を緩めない。テストのアサーション。スタブの payload。

## Capabilities

### New Capabilities
- `tooling/e2e-harness`: E2E の土台が守る約束。**実行は既知の保存先から始まる**こと、**後始末の失敗は握り潰さない**ことの2本を requirement として持つ。同じ path は `update-e2e-harness`（Planning 中）が並列化の requirement で新設予定であり、本 change はそこへ別の requirement を足す。どちらが先に archive されても、後から archive する側が同じ spec に追記される

### Modified Capabilities
（なし。プロダクトの振る舞いは変わらない）

## Impact

- `test/e2e/proposal-persistence.spec.ts` — `afterEach` の失敗の表出
- `playwright.config.ts` — 種まきの関数化と、その直前の保存先の初期化。seed の内容は変えない
- 影響を受ける他の spec: 無い。保存先の初期化は種まきより前で、seed の内容は変わらない
- `update-e2e-harness` — 同じ `playwright.config.ts` と `tooling/e2e-harness` に触る。本 change を先に develop へ入れ、あちらは rebase で追随する
