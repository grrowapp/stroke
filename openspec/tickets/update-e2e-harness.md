---
status: Planning
change: update-e2e-harness
tags:
  - proposal
  - specs
  - design
  - tasks
triage:
  - maintenance
---

# update-e2e-harness

E2E が常に遅い。原因は3つに割れていて、いずれも実装の都合ではなく**土台の作り**に由来する。速さを取り戻す施策を3本まとめて扱う。

> **change-id を `update-e2e-harness` へ改名した（2026-09-01、ユーザーの決め）。** もとの id は先頭の動詞が `improve` で、`docs/agents/issue-tracker.md`「change-id の命名」が挙げる5動詞（`create` / `add` / `update` / `fix` / `remove`）に無かった。E2E は壊れているのではなく遅いだけなので `fix` ではなく `update` を採り、対象は spec で切った capability 名（`tooling/e2e-harness`）に揃えた。ticket のファイル名も同時に改めている。

## 訂正（2026-09-01）

以下の本文は起票時（2026-08-31）の記録で、**原文のまま残す**。change の artifact を作る過程で読み直しと実測を行い、8件が事実と食い違っていた。本節と本文が食い違う箇所は**本節が正**である。根拠はいずれも [`design.md`](../changes/update-e2e-harness/design.md) にある。

> **本節も 2026-09-01 の rebase で書き直した。** develop が `playwright.config.ts` を 152行から 258行へ作り直し、**作業ツリー名の固定表（`PORT_SLOT`）が廃止**されて実行のたびに空きポートを取る形になった。E2E の置き場も `e2e/` から `test/e2e/` へ移っている。**訂正7 と訂正8 はこれで対象が消えたので取り下げた。** 訂正9〜11 を足し、**本節の**行番号を実ファイルで取り直してある。件数（221 / 143 / 78 / 38 / 33 / 5 / 64 / 7 / 14）と訂正6 の 18.4分は rebase 後も変わっていない。
>
> **本文（「起票の根拠」以降）の `playwright.config.ts` の行番号は、152行だった頃のものである。** 原文のまま残す方針なので直さない。読み替えは次のとおり — `:116-117`（並列の設定）→ `:221-222`、`:44-47`（根のパス）→ `:102-105`、`:61`（`SYNC_INTERVAL_MS`）→ `:166`、`:125`（スタブの起動）→ `:230`、`:127`・`:134`（`reuseExistingServer`）→ `:232`・`:239`、`:132`（アプリの起動）→ `:237`、`:26-34`・`:37`・`:40-41`（`PORT_SLOT` まわり）→ **廃止**、`:20-22`（混線の事故記録）→ `:20-23`。`test/e2e/**` の各ファイルの内部の行番号は動いていない。

### 訂正1: 「`fullyParallel: false` / `workers: 1` が原因」は半分だけ正しい

本文「起票の根拠 1」は2つを並べて原因に挙げているが、**直すべきは `workers` だけである**（現行は `playwright.config.ts:221-222`）。

`fullyParallel` を立てないとき、振り分けは require したファイルごとに1グループになる（`playwright/lib/runner/index.js:2367-2405`・`:2631`）。したがって `false` のまま `workers` を上げるだけでファイル単位の並列が得られ、**ファイルの中の順序は保たれる**。`stroke-exit.spec.ts:27` の `mode: 'serial'` もそのまま効く。

逆に `true` にすると同じファイルのテストが別々の worker へ散る。`resetBoard` を払っていない78件は、同じファイルの前のテストが残した状態の上で走っているので、**この78件の足元が消える**。221件すべてに前提づくりを足すことになり、施策 B と正面から逆を向く。**`fullyParallel` は `false` のまま触らない。**

### 訂正2: 分けるのは registry だけでは足りない

本文「施策 A」は「registry を worker 単位に分けて並列化する」と書いているが、worker ごとに要るのは **registry・スタブ・アプリのサーバー・待ち受けの番号の4つすべて**である（4つ目は rebase 後に加わった。訂正10）。

アプリの走査先と registry の在り処は起動時の環境変数で固まる（`nuxt.config.ts:207` の `projectShareRoot`・`:211` の `specWorkflowHome`）。registry を分けても、それを読むアプリが1台なら分けた意味がない。

かつ `webServer` は `TestConfig` のトップレベル項目で（`playwright/types/test.d.ts:1044`）、実行1回につき1組しか持てない。**worker ごとのサーバーは `webServer` では書けず、worker scope の fixture へ移すしかない。**

### 訂正3: `process.env.TEST_PARALLEL_INDEX` が使えるので、テスト側は書き換えずに済む

本文「施策 A」は `REGISTRY_PATH` を直に書く7箇所を「同じ割り直しに乗せる必要がある」としているが、**乗せ替えは要らない**。

`TEST_PARALLEL_INDEX` は worker プロセスの起動時、**テストのモジュールが読み込まれるより前**に立つ（`playwright/lib/worker/workerProcessEntry.js:1365-1366`）。したがってモジュールのトップレベルの定数のまま worker ごとの値にできる。`stub.*` の**64箇所**も `degraded.spec.ts` の `REGISTRY_PATH` **7箇所**も `stroke-exit.spec.ts:12` も、**書き換えずに済む**。触るのは値を作っている1箇所（現行の `playwright.config.ts:78-105`）だけである。

同時に走る worker が同じ値を持たないことは型の説明が保証している（`types/test.d.ts:2568-2576`）。`workerIndex` は worker が作り直されるたびに増えるので、取り合うものの割り当てには使わない。

ただし**「無ければ投げる」はトップレベルに置けない**。テストのモジュールは本体プロセスでも1回評価される（`playwright/lib/runner/index.js:6665` の `createLoadTask("in-process")` → `:2044-2056` の `InProcessLoaderHost` → `playwright/lib/common/index.js:2897` の `requireOrImport`）ので、そこには `TEST_PARALLEL_INDEX` が無い。投げると収集の段で落ちて1件も走らない。**worker の外では使えない値に落とし、使う所で止める**（design.md 決定5）。

なお `test` の import 行だけは 14本すべてで変わる。worker scope の fixture を配るために、出所が `@playwright/test` から `./support` へ移る（design.md 決定2）。テストの本体・引数・アサーションは1行も変わらない。

### 訂正4: config を import しただけで種まきの副作用が走る

本文が拾えていない事実である。`playwright.config.ts:188-216` の種まき（`:188-190` のディレクトリ作成ループ・`:200-213` の承認まで進んだセッション・`:215-216` の registry の書き出し）は**モジュール本体**にあり、5本のファイル（`support.ts` / `degraded.spec.ts` / `proposal-persistence.spec.ts` / `stroke-exit.spec.ts` / `ws-disconnect.spec.ts`）がこのモジュールから定数を import している。

したがって**種まきは worker のプロセスでも走る**。いま害が出ていないのは worker が1本だからで、**worker を増やすとここが最初にぶつかる**。

### 訂正5: ファイル単位の並列には天井がある

本文はこれに触れていない。同時に働ける worker は最大でもファイルの本数（14）までで、**実行時間はいちばん長いファイルの時間を下回らない**。

**ファイルごとの時間は未計測である。** 候補は `workspace.spec.ts`（43件）と `upstream-style.spec.ts`（33件）だが、これは件数からの推測であって実測ではない。着手時に測り、1本が天井を作っているならそのファイルの分割は**別 change として起こす**。

### 訂正6: 総実行時間は 18.4分

本文「未計測」の「総実行時間を測っていない」は埋まった。**18.4分・221 passed**（2026-09-01、フル実行の実測）。1件あたり平均 5.0秒である（総時間 ÷ 件数）。

残る未計測は、**1回の `resetBoard` が使う秒数**（`SYNC_INTERVAL_MS = 300` と `timeout: 15_000` は設定値であって実測値ではない）と、**ファイルごとの実行時間**（訂正5）の2つである。

### 訂正7: ~~`PORT_SLOT` の `?? 9` の既定は残さない~~ → **取り下げ（2026-09-01）**

2026-09-01 の rebase で **`PORT_SLOT` の表も `?? 9` の既定も `playwright.config.ts` から消えた**。直す対象が存在しない。

いまの `:25-32` は固定表を**明示的に却下している**。理由は訂正7 が書こうとしていた理由とほぼ同じである — 「ツリーを増やすたびに人が表を足す必要があり、足し忘れは衝突ではなく『他人のスタブを掴む』方向へ倒れることもある」。代わりに `:41` の `PORT_SEARCH_START = 50000` から上へ空きを探して取る（`:71-76` の `takeFreePort`）。

**本 change は固定割り当てへ戻さない。** 戻すと develop の修正を巻き戻すことになる。

### 訂正8: ~~`PORT_SLOT` の件は本 change で扱う~~ → **取り下げ（2026-09-01）**

訂正7 と同じ理由で、扱う対象が存在しない。本文「併せて出ている事実 / `PORT_SLOT` に pre* が揃っていない」が挙げている「pre* 6本が同じ slot へ落ちる」は、**develop 側で解消済み**である。

これにより、本 change が扱うのは **A・B・C の3施策だけ**になった（4件目が落ちた）。

### 訂正9: E2E の置き場が `test/e2e/` へ移った（2026-09-01）

本文と「参照」節が書いている `e2e/**` のパスは、いまはすべて `test/e2e/**` である（`playwright.config.ts:219` の `testDir: './test/e2e'`）。`e2e/` というディレクトリは存在しない。**本文の `e2e/` はすべて `test/e2e/` と読む。** 各ファイルの内部の行番号は移動していない。

`docs/specs/core/system-structure.md:43` と `.spec-workflow/steering/structure.md:13`・`:86` は `e2e/` のままで、**実体と食い違っている**。どちらを規範とするかは change の 7.1 でユーザーに諮る。

### 訂正10: 待ち受けの番号も worker ごとに分ける（2026-09-01）

訂正2 の「3つ」に4つ目が加わった。

`playwright.config.ts:89-96` の `resolvePort` は、決めた番号を `process.env.E2E_STUB_PORT` / `E2E_APP_PORT` へ控える。**worker は fork でこの環境変数を引き継ぐ**ので、`workers` を上げると全 worker が同じスタブと同じアプリへ当たる。

この持ち回りは捨てられない。`:78-88` に経緯があり、控えずに使うと `TypeError: fetch failed` で **207件が落ちた**（`:84`、実測 2026-08-31）。**鍵に worker の名札を混ぜ、worker ごとに自分の空きを取らせる**（design.md 決定3）。番号を算術で振らない。

### 訂正11: 本物へ向けさせない番人が新設された（2026-09-01）

`playwright.config.ts:118-152` の `refuseRealTargets()`。`NUXT_PROJECT_SHARE_ROOT` / `NUXT_SPEC_WORKFLOW_HOME` がこの設定の保存先と一致すること（`:119-132`）・保存先が `${E2E_ROOT}/` の下から出ていないこと（`:134-139`）・`NUXT_UPSTREAM_BASE_URL` がこの設定のスタブを指していること（`:141-149`）を起動時に検査して落とす。ADR-0001 の線をテストが越えないための番人である。

**施策 A は必ずここを通る。** 照合している3つの値をすべて worker ごとに動かすためである。畳まず、worker の側へ移して同じ検査を通す（design.md 決定9）。

### `status` を上げた

`needs-triage` → `ready-for-agent`。artifact が4本（proposal / specs / design / tasks）揃い、`openspec validate update-e2e-harness --strict --store stroke` が通っているため。

## 起票の根拠（2026-08-31 実測）

### 1. 直列で回している

`playwright.config.ts:116-117` が `fullyParallel: false` / `workers: 1`。`e2e/` の spec は **14本・`test(` 定義は 221件**で、これを1 worker で順に流している。

並列にできない理由ははっきりしている。テストが**プロセス共有のファイル**を書き換えるためである。

- `e2e/support.ts:117` と `:124` の `writeFileSync(REGISTRY_PATH, …)` — `REGISTRY_PATH` は `playwright.config.ts:44-47` で `.e2e-tmp/home/activeProjects.json` と定まる、作業ツリーに1つのパス
- `e2e/degraded.spec.ts` は `resetBoard` を通さず**直接** `REGISTRY_PATH` を7回書く（16・20・33・40・48・52・63行）
- スタブも1プロセス1ポートである（`playwright.config.ts:125` で `STUB_PORT` に1つだけ起動、`e2e/fixtures/upstream-stub.mjs:511` で listen）。`e2e/support.ts:115` の `stub.reset()` はその1台の状態を全部倒す

つまり worker を増やすと、別の worker の registry とスタブを踏み倒す。**並列化は「workers を上げる」では済まず、共有物を worker 単位へ割り直す設計変更を伴う。**

> 訂正1（`fullyParallel` は触らない）・訂正2（アプリのサーバーも要る）・訂正4（config の import で種まきが走る）・訂正10（待ち受けの番号も worker へ引き継がれる）・訂正11（番人が新設された）を参照。

### 2. 各テストが基準を作り直している

`e2e/support.ts:105-130` の `resetBoard` は、1回の呼び出しで次を往復する。

1. `stub.reset()`（115行）
2. registry を空にする（117行）
3. `data-connected="false"` を待つ（119行）
4. `notification-row` が0件になるのを待つ（120行）
5. registry を戻す（124行）
6. `data-connected="true"` を待つ（125行）
7. スタブが受けた `tasks/progress` が `EXPECTED_PROGRESS_REQUESTS = 2`（`e2e/support.ts:92`）に達するまでポーリング（127-129行、`timeout: 15_000`）

切断・再接続の検出は `SYNC_INTERVAL_MS = 300`（`playwright.config.ts:61`）の周期に律速される。

呼び出しは **38箇所**。うち 33箇所が `test.beforeEach` の中、5箇所がテスト本体の中（`e2e/degraded.spec.ts:57`・`e2e/approval-annotation.spec.ts:376`・`e2e/notifications.spec.ts:249`/`:268`/`:284`）。`beforeEach` に置かれた分を数えると、**221件中 143件のテストが毎回この往復を払っている**。

| spec | `test(` | `beforeEach` 経由で払うテスト |
| --- | --- | --- |
| `workspace.spec.ts` | 43 | 43 |
| `upstream-style.spec.ts` | 33 | 33 |
| `notifications.spec.ts` | 27 | 27 |
| `design-token.spec.ts` | 21 | 0 |
| `projects.spec.ts` | 19 | 0 |
| `document-editing.spec.ts` | 16 | 16 |
| `agent-question.spec.ts` | 13 | 0 |
| `approval-annotation.spec.ts` | 13 | 10 |
| `toast.spec.ts` | 13 | 13 |
| `stroke-exit.spec.ts` | 10 | 0 |
| `degraded.spec.ts` | 6 | 0 |
| `proposal-persistence.spec.ts` | 4 | 0 |
| `ws-disconnect.spec.ts` | 2 | 0 |
| `markdown-hydration.spec.ts` | 1 | 1 |
| 計 | 221 | 143 |

**78件は既に払っていない。** 払っている 143件のうち何件が本当に基準の作り直しを要るのかは、まだ数えていない。

### 3. build が入っていない

`playwright.config.ts:132` の webServer は `node .output/server/index.mjs` を叩く。したがって事前に `yarn build` が要る。しかし `package.json:23` の `"test:e2e": "playwright test"` に build は含まれていない。

速度の話ではない。**古い `.output` に当てて嘘の結果を得る事故が起きうる**という話である。ソースを直して `yarn test:e2e` だけを回すと、直す前のビルドが緑を返す。

### 4. サーバーを毎回立て直している

`playwright.config.ts:127` と `:134` がどちらも `reuseExistingServer: false`。スタブとアプリを毎回起動し直す。

## 施策

### A. registry を worker 単位に分けて並列化する

**効果が最大。** `playwright.config.ts:26-34` の `PORT_SLOT` と `:40-41` の `STUB_PORT` / `APP_PORT`、`:44-47` の `E2E_ROOT` / `PROJECTS_PARENT` / `SPEC_WORKFLOW_HOME` / `REGISTRY_PATH` を、**作業ツリー単位から worker 単位へ**拡張する設計変更を含む。スタブも worker ごとに立てないと `stub.reset()` が他の worker を倒す。

`e2e/degraded.spec.ts` が `REGISTRY_PATH` を直に書いている7箇所も、同じ割り直しに乗せる必要がある。

> 訂正2（分けるのは4つ）・訂正3（テスト側は書き換えずに済む）・訂正5（天井がある）・訂正10（待ち受けの番号も分ける）を参照。

### B. `resetBoard` を必要なテストだけに絞る

既存の枠内で効く。前提として**どのテストが基準の作り直しを要るのかの棚卸し**が要る。上表の 143件が対象で、`beforeEach` に一律で置かれている 33箇所を、テスト単位の要否に落とす。

### C. `test:e2e` に build を前置する

速くはならない。**古い `.output` に当てる事故が消える。** 反復中は build を挟みたくない場面があるので、build を挟まない版を別スクリプトに分ける必要性も検討対象に含める。

## 併せて出ている事実

### `PORT_SLOT` に pre* が揃っていない

`/home/vagrant/work/stroke-board/` には `pre1`〜`pre7` の7本の作業ツリーがある。一方 `playwright.config.ts:26-34` の表に載っているのは `pre3: 10` の**1件だけ**で、残る6本は `:37` の `?? 9` により**全部 slot 9 に落ちる**。この6本のうち2本で同時に E2E を回すと、STUB_PORT / APP_PORT が衝突する。

同じファイルの `:20-22` に実測の事故記録が残っている。

> テストが当たってしまう（実測: 別ツリーの実行と混ざって通知の件数が合わなくなった。2026-08-25 には別ツリーの e2e 起動でこちらの web サーバが2回落ちている。playwright は `reuseExistingServer: false` で走るので、同時実行の検出も排他もしない）。

**扱いが論点である。** 施策 A が `PORT_SLOT` を worker 単位へ触るので同じ change に入れるのが自然に見えるが、こちらは「並列を速くする」ではなく「別ツリー同士がぶつかる」話で、A を待たずに表へ6行足すだけでも消える。本 change で扱うか別に切るかを決める。

> **この節は 2026-09-01 の rebase で丸ごと過去のものになった。** `PORT_SLOT` の表も `?? 9` も廃止され、待ち受けは実行のたびに空きを取る（訂正7・訂正8）。本 change の対象から外れている。

### 既知の flake

`e2e/workspace.spec.ts` の接続待ちが1件落ちることがある。単独実行では緑。`workspace.spec.ts` 自体に接続の待ち合わせは書かれておらず、待っているのは `e2e/support.ts:125` の `data-connected="true"` である。**原因は `resetBoard` の再接続待ち**で、施策 A・B のどちらも同じ箇所に触れる。

## やらないこと

- **テストの中身（アサーション）を変えない。** 落ちる／通るの判定は現状のまま
- **スタブの payload を変えない。** `e2e/fixtures/upstream-stub.mjs`（513行）が返す形は本家の実測に合わせてあり、ここを触るのは別の話
- **E2E を減らさない。** 範囲を絞って回す運用は改善策ではない。回す範囲を狭めているだけで速度は変わらない

## 未計測

**総実行時間を測っていない。** 施策の前後を比べる基準が無いので、最初に現状の実測を取る。1回の `resetBoard` が実際に何秒使うかも同様である（`SYNC_INTERVAL_MS = 300` と `timeout: 15_000` は設定値であって実測値ではない）。

> **訂正6（2026-09-01）**: 総実行時間は測れた。**18.4分・221 passed**（フル実行の実測）。1件あたり平均 5.0秒である。残る未計測は、1回の `resetBoard` が使う秒数と、ファイルごとの実行時間（訂正5）の2つである。

## 参照

`e2e/` の位置づけは `docs/specs/core/system-structure.md`（43・55行）。ポートを作業ツリーごとに固定する取り決めと 3399 / slot 3 欠番は `CLAUDE.md` の「Dev サーバー」にある。

> **2026-09-01 の rebase で両方とも変わった。** 置き場は `test/e2e/` で、`system-structure.md:43` は `e2e/` のまま追随していない（訂正9。`:55` は「テストの置き場の規約は steering が持つ」で、E2E の置き場そのものは書いていない）。`CLAUDE.md` の「Dev サーバー」は `:34-35` になり、**slot も欠番も無くなって**「E2E の STUB_PORT / APP_PORT は実行のたびに 50000 から上へ空きを探して取る」と書かれている（訂正7）。dev サーバーの 3399 は既定であって固定ではない（`CLAUDE.md:32`）。
