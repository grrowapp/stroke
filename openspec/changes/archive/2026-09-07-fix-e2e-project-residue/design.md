## Context

動機は proposal.md「Why」、事実の記録は ticket `fix-e2e-project-residue`（追記 2026-09-06）。設計に効く制約だけを挙げる。

- **承認の画面は昇格の直後に steering を起こす**（ADR 0011、`useProposalReview.ts` `promote()`）。「承認済みです」の表示は昇格の直後・起動の前に出るので、テストがその表示を見て `afterEach` に入る時刻と、`invoke-agent` が busy を立てる時刻が重なりうる
- **削除口は busy を 409 で断る**（`docs/specs/api/projects/delete.md`）。プロダクトの仕様で、テストの都合で緩めない
- **`playwright.config.ts` はモジュール本体で種をまき、worker プロセスでも評価される**（`update-e2e-harness` ticket 訂正4）。ここに「消す」処理を置くと、worker の評価で種をまいた後の保存先を消す
- **原因は 409 busy と確定した**（2026-09-06、握り潰しを外した再実行で応答を取得）。承認直後の steering（`/bin/true`、200ms 未満）の実行中に DELETE が届くと断られる。単発 probe と full run では重ならず 204、2本だけの再実行で重なった。**重なるかは timing 次第**
- `update-e2e-harness`（Planning）が同じ `playwright.config.ts` と `tooling/e2e-harness` に触る

## Goals / Non-Goals

**Goals:**
- 残骸が出た run の中で、どのテストがどの応答で消せなかったかが結果に出る
- 前の run が何を残していても、次の run は同じ保存先から始まる

**Non-Goals:**
- 削除口・承認・起動の仕様を変えること
- E2E の速さ、worker の並列化（`update-e2e-harness`）

## Decisions

### D1: 後始末の失敗は `afterEach` の中で throw し、そのテストを落とす

`afterEach` の `.catch(() => undefined)` を外し、応答が 2xx 以外なら対象・status・本文を含む `Error` を投げる。Playwright は hook の失敗をそのテストの失敗として報告する。セッションの削除（`created` の loop）も同じ扱いにする——握り潰しの形が同じで、残れば同じ症状を起こす。

- 代替: `afterAll` でまとめて1件落とす — どのテストが残したかを自分で束ねる必要があり、本体が緑のまま末尾で赤になる形は読みにくい
- 代替: `console.warn` だけ — 発覚の遅さが今と変わらない

削除の直前に `GET /api/strokes/:name` で対象が在ることを確かめる。GET が 404 なら消すものが無いので削除を送らず、済んだと扱う。**GET で在ると確かめた後の DELETE は、404 を含めて 2xx 以外をすべて失敗にする。** 名前で在るのに `projectId` で見つからないのは、テスト側の導出（`join(PROJECTS_PARENT, name)` の sha1）とサーバ側（`deriveProjectId`）がずれたということで、そこを緑で通すとずれが誰にも見えない。

- 代替: DELETE の 404 を成功扱いにする — 「既に無い」と「id がずれた」を区別できない。却下

`afterEach` は要求そのものが失敗（通信断など）しても `created` / `promoted` を空に戻す（`try/finally`）。戻さないと次のテストの後始末が古い id を再送し、無関係なテストが落ちる。

### D2: 保存先の初期化は config のトップレベルに置き、本体プロセスの評価に限定する

`playwright.config.ts` の種まきの直前で `E2E_ROOT`（`.e2e-tmp`）を丸ごと消す。ただし **`TEST_PARALLEL_INDEX` が無いときだけ**——この環境変数は worker プロセスの入口（`playwright/lib/worker/workerProcessEntry.js:1366`）でだけ立ち、本体プロセスには無い（`update-e2e-harness` ticket 訂正3 と同じ手がかり）。種まきは関数（`seedStore`）に切り出し、トップレベルから呼ぶ。

> **2026-09-06 に置き場を改めた。** 当初は `globalSetup` に置く設計だったが、実装時に Playwright の順序を確かめたところ、**`webServer`（plugin setup）が `globalSetup` より先に走る**（`playwright/lib/runner/index.js:6003-6009` `createGlobalSetupTasks`）。サーバが立った後に消すと、まき直すまでの隙間にサーバ（300ms ごとの registry 同期・要求ごとの走査）が空の保存先を読み、最初のテストが flake しうる。config の評価はサーバの起動より前なので、隙間が無い。

- 代替: `globalSetup` で消してからまき直す — 上の順序の問題。却下
- 代替: config のトップレベルで無条件に消す — worker でも評価されるので、worker の起動のたびに保存先が消えて作り直される。1 worker の今は害が出ないが、worker を増やすと壊れる。guard で本体プロセスに限定することで解消
- 代替: `globalTeardown` で消す — 途中で落ちた・強制終了した run の残骸が残る。調べたい残骸は消える
- 代替: 名前の規約（`e2e-` 始まり）で選んで消す — 規約から外れた残骸を見逃す

**消す先の所在は `E2E_ROOT` の定義で固定する。** 当初は `join(process.cwd(), '.e2e-tmp')` だったが、別の場所から `-c` でこの設定を指して起動すると、その場所の `.e2e-tmp` を消す。設定ファイルの隣（`dirname(fileURLToPath(import.meta.url))`）から組むことで、作業ツリーの中に固定する。`refuseRealTargets()` の検査（保存先が `E2E_ROOT` の下にあるかを見る箇所）は、サーバと種の書き先が `E2E_ROOT` の下から出ていないことを見るもので、`E2E_ROOT` 自体の所在は見ていない。消す先の保証を「検査」ではなく「定義」に置く（santa-method レビュー指摘 2026-09-06）。

### D3: 原因の確定は tasks の中で full run を回して取る

握り潰しを外した状態（D1）で `yarn test:e2e` を回し、`proposal-persistence.spec.ts` の結果をそのまま記録にする。赤なら出た status と本文を ticket に追記し、対処は事実を見てから決める。

> 結果（2026-09-06）: full run では緑だったが、2本だけの再実行で **409 busy** が出た（ticket 追記）。対処は D4 として、ユーザーの決めでこの change に入れた。

### D4: プロジェクトの削除は、busy で断られる間だけ出し直す

`afterEach` は D1 の存在確認（`GET /api/strokes/:name`）の後に `DELETE` を送り、応答が **`reason: busy` の 409** である間だけ**上限付き**（5秒、100ms 間隔）で出し直す。それ以外の 2xx 以外は即失敗。上限は steering の timeout とは無関係に短く取る——E2E の実行は 200ms 未満で終わる。上限に達したら、待ちきれなかったことと最後の応答を含めて失敗にする（D1 と同じ経路）。

**観測点はサーバ自身の busy 判定にする。** `state.json` の `invocation` を見て `running` でなくなるのを待つ案は、観測点が busy の事実（`running.ts` のメモリ上の集合）とずれる。`beginRun` で集合に入ってから A8 で `running` が書かれるまでの間、`invocation` は昇格時の `failed` のままで、それを「終わった」と読むと直後の DELETE が busy で断られる。さらに afterEach の時点では画面がまだ起動を要求していないこともあり、その場合も `failed` を見て同じ結果になる（santa-method レビュー指摘 2026-09-06、2周目）。

- 代替: `invocation` が `running` でなくなるまで待つ — 上の理由で観測点がずれる。却下
- 代替: `page.waitForURL('/projects')` で画面の起動要求が済むのを待ってから `invocation` を見る — 画面の遷移に後始末を結びつける。busy の判定はサーバにしか無いので、サーバに聞くほうが直接である
- 代替: `fs.rm` で直接消す（`stroke-exit.spec.ts` の `afterAll` と同じ）— 確実に消えるが、サーバの `running` 集合には残る。巡回が起こし直すので、消えたディレクトリを `stat` して失敗する経路を残す
- 代替: 画面ではなく API で承認まで進め、steering を起こさない — 画面の承認（U10 → U14 → U13）を通す意味が消える。このテストが確かめているのは画面の承認そのものである
- 代替: 削除口が busy を待つ — プロダクトの仕様（busy は 409）をテストの都合で変えることになる。却下

## Risks / Trade-offs

- [D1 で full run が赤になる] → それが狙い。残骸の原因が結果に出る。D2 が入っているので次の run は壊れない
- [D4 の出し直しが上限に達する（巡回が起こし直した直後に重なる）] → 巡回は 60秒周期で、1回の実行は 200ms 未満。重なっても上限（5秒）の中で終わる。達したら失敗として出るので隠れない
- [afterEach の DELETE が画面の起動要求より先に届く] → DELETE は通り、画面側の `invoke-agent` は対象が無くて失敗するが、画面はそれを捨てる（`kickSteering` の catch。届かなくても昇格は巻き戻らない設計）。残骸は出ない
- [D2 の guard が効かず worker でも消す] → worker では `TEST_PARALLEL_INDEX` が config を読むより前に必ず立つ（`workerProcessEntry.js`）。立たない環境は本体プロセスだけで、そこで消すのが狙い
- [`--ui` / VS Code 拡張（testServer 経路）では、`webServer` を立てた後に別プロセスの loader が config を読む] → その loader には `TEST_PARALLEL_INDEX` が無く、サーバ稼働中に消してまき直す。`yarn test:e2e`（`playwright test`、in-process load）には当たらない。既知の制限として置く。使う人が出たら別 change
- [`playwright test --list` でも消える] → 一覧を出すだけで落ちた run の残骸が消える。調べたいときは `--list` の前に見る。config のコメントに書いた
- [`update-e2e-harness` が種まきを fixture へ移す] → 種まきを関数に切り出しておくことが、あちらの移行を楽にする。「消す」は本体プロセスで1回の処理なので、worker 単位の土台になっても残る
