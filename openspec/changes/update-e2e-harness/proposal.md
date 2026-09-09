# update-e2e-harness

> **2026-09-01 の rebase で書き直した。** 本 artifact は rebase の前に書かれ、`playwright.config.ts` を 152行の姿（作業ツリー名の固定表でポートを引く形）として読んでいた。その後 develop が同ファイルを 258行へ作り直し、固定表は廃止されて**実行のたびに空きポートを OS から取る**形になっている。E2E の置き場も `e2e/` から `test/e2e/` へ移った。行番号・パス・施策 A の設計を、実ファイルを開いて取り直してある。

## Why

E2E を1回回すのに **18.4分**かかる。`test/e2e/` の spec は **14本・`test(` の定義は 221件**（実測）で、これを worker 1本の直列で流している。1件あたり平均 5.0秒である（総時間 ÷ 件数）。

> 18.4分は起票時（2026-09-01）に測られた値として渡されたもので、**本 change の作成者が自分で測り直したものではない**。ticket 本文は起票時（2026-08-31）「総実行時間を測っていない」と書いていたが、2026-09-01 の訂正でこの値を取り込んである。件数と内訳はすべて本 change の作成者が数え直して一致を確認した（2026-09-01 の rebase 後も 221 / 143 / 78 / 38 / 33 / 5 / 64 / 7 / 14 のいずれも変わっていない）。

遅いこと自体より重いのは、**遅さの出どころが実装の都合ではなく土台の作りにある**ことである。3つに割れる。

**1. 直列でしか回せない。** `playwright.config.ts:221-222` が `fullyParallel: false` / `workers: 1`。worker を上げれば済む話ではない。テストが**プロセス共有のもの**を4つ踏むためである。

- **registry** — `test/e2e/support.ts:117`・`:124` の `writeFileSync(REGISTRY_PATH, …)`。`REGISTRY_PATH` は `playwright.config.ts:105` で作業ツリーに1つのパスに定まる。`test/e2e/degraded.spec.ts` は `resetBoard` を通さず直に7回書く（16・20・33・40・48・52・63行）
- **スタブ** — `playwright.config.ts:230` が `STUB_PORT` に1台だけ起こす。状態はプロセス内のモジュール変数（`test/e2e/fixtures/upstream-stub.mjs:17` の `projects` Map・`:18` の `sockets` Set・`:27` の `stats`）で、`test/e2e/support.ts:115` の `stub.reset()` はその1台を全部倒す（`:43` の `projects.clear()`）
- **アプリのサーバー** — `playwright.config.ts:237` が1台だけ起こす。走査先と registry の在り処は起動時の環境変数で固まる（`nuxt.config.ts:207` の `projectShareRoot`・`:211` の `specWorkflowHome`）。**registry を worker ごとに分けるなら、それを読むアプリも worker ごとに要る**
- **待ち受けの番号そのもの** — `playwright.config.ts:89-99` の `resolvePort` は、決めた番号を `process.env.E2E_STUB_PORT` / `E2E_APP_PORT` へ控える。worker は fork でこの環境変数を引き継ぐので、**`workers` を上げると全 worker が同じ番号を読む。** 空きを探す作りは worker ごとの分離をまだ与えていない（この持ち回りは `:78-88` に経緯が書かれており、無いと `TypeError: fetch failed` で 207件が落ちた実測がある。**捨てられない**）

さらに、5本のファイルが `playwright.config.ts` から定数を直に import している（`support.ts` / `degraded.spec.ts` / `proposal-persistence.spec.ts` / `stroke-exit.spec.ts` / `ws-disconnect.spec.ts`）。config のモジュールは読み込まれた時点で種まきの副作用を走らせる（`:188-190` のディレクトリ作成ループ・`:200-213` の承認まで進んだセッション・`:215-216` の registry 書き出し）ので、**この副作用は worker のプロセスでも走る**。worker を増やせば、各 worker が起動時に同じ registry を書き潰し合う。

**2. 143件が毎回、基準を作り直している。** `test/e2e/support.ts:105-130` の `resetBoard` は1回の呼び出しで、スタブを倒し・registry を空にし・`data-connected="false"` と通知0件を待ち・registry を戻し・`data-connected="true"` を待ち・スタブが受けた `tasks/progress` が2に達するまでポーリングする（`:128` の `timeout: 15_000`）。切断と再接続の検出は `playwright.config.ts:166` の `SYNC_INTERVAL_MS = 300` の周期に律速される。

呼び出しは38箇所（実測）。うち33箇所が `test.beforeEach` の中で、テスト本体の中は5箇所（`degraded.spec.ts:57`・`approval-annotation.spec.ts:376`・`notifications.spec.ts:249`/`:268`/`:284`）。`beforeEach` の分を describe ごとに数え直すと、**221件のうち 143件**が毎回この往復を払っている。

| spec | `test(` | `beforeEach` 経由で払う |
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
| 計 | **221** | **143** |

**78件は既に払っていない。** 払っている 143件のうち何件が本当に作り直しを要るのかは、まだ数えていない。

**3. 古いビルドに当てて嘘の結果を得る。** `playwright.config.ts:237` の webServer は `node .output/server/index.mjs` を叩く。事前の `yarn build` が要るのに、`package.json:23` の `"test:e2e": "playwright test"` に build が無い。ソースを直して `yarn test:e2e` だけを回すと、**直す前のビルドが緑を返す。**

**これは仮定ではない。実際に起きている。** archive 済みの change `adr0017-sub-fix-normalization-offset` の `tasks.md:86`・`:115` に「6.7 の毒見は最初、古いビルドに当たって13本とも緑のままだった。ビルドし直して初めて新規3本だけが落ちた」と記録が残っている（規範としてではなく、起きた事実の記録として引く）。`README.md:201-206` のテスト表にも事前ビルドの記載は無く、**気づく手がかりがどこにも無い。**

速度の話は 1 と 2 だが、**信頼性の話である 3 が最も重い。** 遅いテストは待てば答えを返すが、嘘を返すテストは待っても答えを返さない。

### 土台に既に立っている番人

`playwright.config.ts:118-152` の `refuseRealTargets()` は、E2E が本物へ向いていないことを起動時に検査して落とす。rebase で新設された。

- `NUXT_PROJECT_SHARE_ROOT` / `NUXT_SPEC_WORKFLOW_HOME` が、この設定が決めた `PROJECTS_PARENT` / `SPEC_WORKFLOW_HOME` と一致すること（`:119-132`）
- 保存先が `${E2E_ROOT}/` の下から出ていないこと（`:134-139`）
- `NUXT_UPSTREAM_BASE_URL` が、この設定が決めた `STUB_PORT` のスタブを指していること（`:141-149`）

**施策 A は必ずここを通る。** worker ごとに根とポートを割り直すということは、この番人が照合している3つの値をすべて worker ごとに動かすということである。番人を壊せば、ADR-0001 が引いた「stroke-board は `.spec-workflow/` へ直接書かない」の線をテストが越えられるようになる。**壊さないことが施策 A の受け入れ条件の1つである。**

## What Changes

3本の施策を1つの change で扱う。1（並列化）と 2（絞り込み）は同じ `resetBoard` に触り、片方だけ入れると測り直しが二重になる。3（build 前置）は前2つの効果を測るための前提でもある。

### A. 共有物を worker 単位へ割り直す

- **ポートを worker ごとに取る。** いまは `playwright.config.ts:98-99` が本体プロセスで1組だけ取り、`:89-96` の `resolvePort` が環境変数へ控えて worker へ引き継ぐ。**引き継ぎの鍵に worker の番号を混ぜ**、worker ごとに自分の空きを取らせる。番号を算術で振らない（design.md 決定3）
- **`E2E_ROOT` の下に worker ごとの根を掘る。** `PROJECTS_PARENT` / `SPEC_WORKFLOW_HOME` / `REGISTRY_PATH`（`playwright.config.ts:102-105`）はその下なので、根を分ければ全部が分かれる。`E2E_ROOT`（`.e2e-tmp`）自体は動かさない — `refuseRealTargets()` の `:134-139` がここを基準に「外を指していないか」を見ているため
- **スタブとアプリを worker ごとに起こす。** `webServer` は `TestConfig` のトップレベルの項目で（`playwright/types/test.d.ts:1044`）、実行1回につき1組しか持てない。**worker scope の fixture へ移す**
- **`refuseRealTargets()` を worker の側でも通す。** いまは config のモジュール本体で1回走る（`:152`）。worker ごとの根とポートに対して、サーバーを起こす直前に同じ検査を通す
- **種まきの副作用を config のモジュール本体から出す。** `playwright.config.ts:188-216`
- **テストの中身は1つも触らない。** 値の作り方だけを変えるので、`STUB_URL`（`support.ts:11`）も `stub.*` の64箇所も `REGISTRY_PATH` の7箇所も書き換えずに worker の値へ向く（design.md 決定2）。**変わるのは 14本の spec の `test` の import 行だけ**で、worker scope の fixture を配るために出所が `@playwright/test` から `./support` へ移る

### B. `resetBoard` を要るテストだけに絞る

- **まず要否を測る。** 33箇所の `beforeEach` を1つずつ外して、その describe のテストが通るかを見る。要ると分かった分だけ残す
- 一律の `beforeEach` から、テスト単位の宣言へ落とす

### C. `test:e2e` に build を前置する

- `package.json` の `test:e2e` を build 込みにする
- **反復のための build 抜きの口を別に立てる。** 1回の build を待たずに1本だけ回したい場面があるため。ただし**既定は build 込み**にする。既定が嘘を返さない側でなければ意味がない
- **どちらがどちらかを、承認の要らない場所にも書く。** script の名前そのものと、省く口が走り出しに出す1行。`README.md:201-206` のテスト表への追記は上位資料なので承認が要るが、**承認が下りなくても spec の「どちらを選べばよいかが読める」が満たされている**状態にする

### rebase で消えた論点: `PORT_SLOT` に pre* を揃える

**本 change の対象から外れた。** 起票時の `playwright.config.ts` は作業ツリー名の固定表（`PORT_SLOT`）でポートを引き、表に無いツリーを `?? 9` でまとめて1つの slot へ落としていた。`pre1`〜`pre7` の7本のうち表にあるのは `pre3` だけで、残る6本が同じ待ち受けを奪い合っていた。

2026-09-01 の rebase で develop がこの表ごと廃止している。いまの `playwright.config.ts:25-32` は固定表を明示的に却下しており、その理由は本 change が書こうとしていた理由とほぼ同じである。

> かつては作業ツリー名の固定表で割り当てていた。表に無いツリーはまとめて 1 つのスロットへ落ちる作りだったため、`pre1`〜`pre7` の7本が同じ待ち受けを奪い合っていた（実測 2026-08-31: pre3 の実行中は pre6 が起動できない）。ツリーを増やすたびに人が表を足す必要があり、足し忘れは衝突ではなく「他人のスタブを掴む」方向へ倒れることもある。

`PORT_SLOT` という識別子は、いま `playwright.config.ts` にも `docs/` にも `README.md` にも `CLAUDE.md` にも `openspec/specs/` にも無い（grep 0件）。**表を埋める作業も `?? 9` を止める作業も、直す対象が存在しない。**

### 対象外

- **テストのアサーションを変えない。** 落ちる／通るの判定は現状のまま。B の絞り込みで落ちるようになったテストは、絞り込みが誤っている
- **スタブの payload を変えない。** `test/e2e/fixtures/upstream-stub.mjs`（513行）が返す形は本家の実測に合わせてある。worker ごとに立てるだけで、返すものは変えない
- **E2E を減らさない。** 範囲を絞って回す運用は改善ではない。回す量を減らしているだけで、土台は遅いまま
- **空きポートを探す方式を固定割り当てへ戻さない。** `playwright.config.ts:25-32` が却下した形へ戻ることになる
- **単体テスト（`yarn test`）と `yarn test:live` の土台。** どちらもプロセス共有のファイルを踏んでいない
- **flake そのものの根治。** `workspace.spec.ts` の接続待ちが1件落ちることがある（単独実行では緑）。待っているのは `test/e2e/support.ts:125` の `data-connected="true"` で、A も B も同じ箇所に触るので**結果として消える可能性はある**が、消えたことをもってこの change の成果とはしない。`retries` は現在も未設定（既定 0）で、本 change でも設定しない

## Capabilities

`skip_specs: true` にはしない。**この change が変えるのは「E2E という道具が何を約束するか」だからである。**

いま `yarn test:e2e` は「緑ならソースは正しい」を約束していない（古いビルドに当たる）し、「テストどうしは互いの前提を踏まない」も約束していない（踏まないのは直列で回しているからで、土台がそう作られているからではない）。どちらも実装を差し替えても変わらない、道具の側の約束である。前例として `openspec/specs/tooling/stroke-check/` が同じ性質の道具の振る舞いを要件として持っている。

### New Capabilities

- `tooling/e2e-harness`: E2E を走らせる土台の振る舞い。同時に走る実行どうしが前提を共有しないこと・実行がいま在るソースに対して行われること・前提の作り直しを要るテストだけが払うこと

### Modified Capabilities

なし。既存の機能的 spec（`openspec/specs/` の各 capability）はどれも要件が変わらない。E2E が確かめている中身に手を入れないためである。

## Impact

**土台のコード**

- `playwright.config.ts` — ポートの取り方（`:78-99`）・根のパス（`:102-105`）・番人（`:118-152`）・種まきの副作用（`:188-216`）・並列の設定（`:221-222`）・`use.baseURL`（`:225`）・webServer（`:228-257`）。この change で最も動くファイル
- `test/e2e/support.ts` — 拡張した `test` の再輸出を足す。`STUB_URL`（`:11`）と `resetBoard`（`:105-130`）は**書き換えずに** worker の値へ向く（値の作り方が config 側で変わるため）
- `test/e2e/fixtures/` に worker scope の fixture を1本足す（新規）。**スタブの payload には触らない**
- 14本の spec の `test` の import 行 — `@playwright/test` から `./support` へ。**本体も引数も変えない**

**テストのコード**（割り直しに乗るが、書き換えない分）

| ファイル | 乗る箇所 |
| --- | --- |
| `test/e2e/degraded.spec.ts` | `REGISTRY_PATH` を直に書く7箇所（16・20・33・40・48・52・63行）と `PROJECTS_PARENT`（`:76`）。**書き換えずに worker の根へ向く**ことを確かめる（`specs/tooling/e2e-harness/spec.md`「土台を直に触るテストがある」） |
| `test/e2e/stroke-exit.spec.ts` | モジュール先頭の計算（`:12`）と `PROJECTS_PARENT` 11箇所。`:27` の `mode: 'serial'` は残す |
| `test/e2e/proposal-persistence.spec.ts` | `PROJECTS_PARENT` 3箇所（`:60`・`:100`・`:109`） |
| `test/e2e/ws-disconnect.spec.ts` | `APP_PORT` から直に組む ws の URL（`:70`） |
| `stub.*` を呼ぶ7ファイル | `notifications`(23) / `toast`(14) / `upstream-style`(9) / `workspace`(8) / `approval-annotation`(7) / `document-editing`(2) / `degraded`(1) の計64箇所 |
| `beforeEach` に `resetBoard` を置く33箇所 | B の絞り込み。対象のテストは143件 |

**スクリプト**

- `package.json:23` の `test:e2e` に build を前置し、build 抜きの口を1本足す

**資料**

- `README.md:201-206` のテスト表 — 事前ビルドの記載を足す（承認が要る）
- `CLAUDE.md:34-35`（「Dev サーバー」） — **書き換えを提案しない。** rebase 後のこの2行は既に「E2E の STUB_PORT / APP_PORT は実行のたびに 50000 から上へ空きを探して取る」「どのポートを使ったかは Playwright の起動ログに出る」と書いており、施策 A の後もそのまま正しい。ただし `webServer` を畳むと起動ログを出しているのが Playwright ではなくなるので、**fixture が同じ情報を出す**ことを実装側の受け入れ条件にする（design.md「上位資料への整合反映」）
- `docs/specs/core/system-structure.md:43` — `├── e2e/  Playwright` と書かれたままで、実体（`test/e2e/`）と**食い違っている**。rebase で移った分に docs が追随していない。`CLAUDE.md`「specs が docs と食い違っていたら、見つけた者が責任を持って直す」に照らし、**追随が要る**（`.spec-workflow/steering/structure.md:13`・`:86` も同じ食い違いを持つ。規範の正がどちらかはユーザーに諮る）
- `docs/specs/core/settings-reference.md` — ストローク側の設定は増えない。E2E が使う `NUXT_*` の上書きは実行時のテスト設定で、同ファイル冒頭の規定の対象外。**追随不要**（`playwright.config.ts:245-248` のコメントが既にその整理を書いている）

**依存**

追加なし。`@playwright/test` は 1.62.1（実測）のまま。

**他の change との関係**

- 並走する worktree が7本ある。`playwright.config.ts` は全 worktree が持つファイルなので、**マージのたびにここが当たる**。本 artifact がまさにその当たりで書き直されている。小さく頻繁に取り込む（`CLAUDE.md`「Worktree 運用」）
- E2E の件数を動かす change が並走している。`fix-ws-disconnect-crash` の 8.1 が1本消し、`add-full-width-markdown-editor` の 7章 が数本足す。**221 という数字は本 change が動かさないことの基準であって、固定値ではない**（tasks 8.1）

## 私が取った決め（未承認の仮定）

このセッションではユーザーへの grilling を行っていない（proposal の instruction は `/grilling` と `/AskUserQuestion` を求めているが、本 artifact は artifact 作成の委任として書かれており、ユーザーとの往復の場を持たない）。**次の決めは私が取ったもので、ユーザーの承認を得ていない。** 差し戻す場合はこの表の行を指すこと。

| # | 件 | 決め | 理由 |
| --- | --- | --- | --- |
| 1 | 3施策を1つの change にするか | **1つにまとめる** | A と B は同じ `resetBoard` に触る。別々に入れると、片方を入れた直後にもう片方が同じ箇所を書き換えることになり、効果の測り直しが二重になる。C は A・B の効果を測るための前提でもある（古いビルドに当てたまま「速くなった」と測っても意味がない）。**当初はここに「4件目（`PORT_SLOT` の件）も同じ表の同じ行を触る」という根拠も並べていたが、rebase で表ごと消えたので取り下げた。** 残る根拠は A・B・C の3つの関係だけである |
| 2 | ~~`PORT_SLOT` の pre* 6本を本 change で扱うか~~ | **取り下げ（2026-09-01）** | 2026-09-01 の rebase で `PORT_SLOT` の表そのものが廃止され、ポートは実行のたびに空きを取る形になった（`playwright.config.ts:25-32`・`:41-99`）。**扱う対象が存在しない。** 起票時に挙がっていた「pre* 6本が同じ slot へ落ちる」は develop 側で解消済みである |
| 3 | `skip_specs` にするか | **しない。`tooling/e2e-harness` を新設する** | 変わるのは「E2E という道具が何を約束するか」で、実装を差し替えても変わらない。前例に `openspec/specs/tooling/stroke-check/` がある |
| 4 | build 抜きの口を残すか | **残す。ただし既定は build 込み** | 反復中に1本だけ回したい場面は実在する。だが既定が嘘を返さない側でなければ、事故は消えない |
| 5 | worker ごとに立てるものの範囲 | **registry・スタブ・アプリのサーバー・待ち受けの番号の4つすべて** | registry を分けても、それを読むアプリが1台なら意味がない。走査先と registry の在り処は起動時の環境変数で固まる（`nuxt.config.ts:207`・`:211`）ので、分けるならアプリも分かれる。**4つ目（番号）は rebase 後に加わった** — `resolvePort`（`:89-96`）が本体プロセスの env へ控え、worker が fork で引き継ぐので、いまのままでは全 worker が同じ番号を読む |
| 6 | flake（`workspace.spec.ts` の接続待ち）を成果に数えるか | **数えない。`retries` も設定しない** | A も B も同じ `resetBoard` の再接続待ちに触るので消える可能性はあるが、消したことを確かめる手立てを持たない。`retries` を入れると flake が見えなくなるだけで、直ったことにはならない |
| 7 | 総実行時間を測り直すか | **測り直す。ただし本 artifact の作成中には測らない** | 18.4分は渡された値で、私が測ったものではない。前後を比べる基準なので、実装の着手時に自分で測り直す。**本 artifact の作成では `yarn test:e2e` を回さない**という制約を受けている |
| 8 | change-id を直すか | **直した。`update-e2e-harness` へ改名（2026-09-01、ユーザーの決め）** | `docs/agents/issue-tracker.md`「change-id の命名」は先頭の動詞を `create` / `add` / `update` / `fix` / `remove` の5つに限っており、**もとの id の先頭にあった `improve` はこの5つに無い**。artifact 作成時は「リネームはユーザーの決めであり、artifact を書く側が独断で行うことではない」として食い違いの記録にとどめたが、その後ユーザーの指示で改名した。動詞が `update` なのは、E2E は壊れているのではなく遅いだけだからである（`fix` ではない）。対象は spec で切った capability 名（`tooling/e2e-harness`）に揃えた。ticket も同時に `openspec/tickets/update-e2e-harness.md` へ改名している |
