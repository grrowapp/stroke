# adr0016-sub-add-timeout-to-config — tasks

**1 を先に通す。** 設定の正（`docs/specs/core/settings-reference.md`）の編集にはユーザーの
承認が要り、コードの追随はその後である（ADR-0004・design.md Migration Plan）。

## 1. 設定の正（先行・要ユーザー承認）

- [x] 1.1 `docs/specs/core/settings-reference.md` の `runtimeConfig` 一覧表に
      `claude.timeoutMs`（`180000`）と `claude.timeoutStepMs`（`0`）の2行を足す
      （design.md Decision 3・5）
- [x] 1.2 同資料に2件の説明の節を `claude.maxRetries` の隣へ足す。基準の長さと刻みの
      意味、既定の `0` が「伸ばさない」であること、`retries` が 0 に戻れば基準へ戻る
      ことを書く（design.md Decision 3・5）
- [x] 1.3 `claude.maxRetries` の節の総待ち時間の式を刻みを含む形へ改める。
      「タイムアウトは10分（設定ではない）」と「既定の `2` では最大30分」を落とす
      （実装は 3分で、記述と食い違っている。proposal.md Why）
- [x] 1.4 「設定ではないもの」の表の行「子プロセスのタイムアウトと打ち切りシグナル」を
      「子プロセスを打ち切るシグナル」へ改める。シグナルは設定にしないので行は残す
      （design.md Decision 5-3・Non-Goals）

## 2. 設定の宣言と検証

- [x] 2.1 `nuxt.config.ts` の `runtimeConfig.claude` に `timeoutMs: 180000` と
      `timeoutStepMs: 0` を足す。`maxRetries` の隣に置く
- [x] 2.2 `server/utils/stroke/config.ts` の zod スキーマに
      `timeoutMs: z.number().int().positive()` と
      `timeoutStepMs: z.number().int().min(0)` を足す（design.md Decision 4）

## 3. 打ち切りの時間を渡す

- [x] 3.1 `server/utils/stroke/claude.ts` の `CLAUDE_TIMEOUT_MS` を廃し、
      `ClaudeRunOptions` に必須の `timeoutMs` を足す。既定値を core 側に持たせない
      （design.md Decision 2）
- [x] 3.2 `setTimeout` の待ちと、`close` の失敗メッセージ（`タイムアウト (Nms)`）の
      両方が渡された `timeoutMs` を読むようにする
- [x] 3.3 `server/utils/stroke/ai.ts` の `AiRun` に `timeoutMs` / `timeoutStepMs` を足し、
      上限判定の隣で `timeoutMs + timeoutStepMs * retries` を算出して `runClaude` へ渡す
      （design.md Decision 2。`retries` は「これまでに起こし直した回数」で初回は 0）
- [x] 3.4 `server/utils/stroke/invoke.ts` の `buildRun` が設定から2件を引いて `AiRun` に
      詰める。ストロークと steering の両方の分岐へ同じ値を渡す（design.md Decision 7）

## 4. テスト

- [x] 4.1 `server/utils/stroke/ai.test.ts`: `retries` が 0 の起動で `runClaude` へ渡る
      `timeoutMs` が基準の長さそのものになるテスト（刻みが乗らない）
- [x] 4.2 同: `retries` が 1・2 の起動で、基準 + 刻み × 回数 が渡るテスト
- [x] 4.3 同: `timeoutStepMs` が `0` なら `retries` によらず基準の長さが渡るテスト
- [x] 4.4 `test/server/utils/stroke/claude.test.ts`: 渡した `timeoutMs` で打ち切られ、
      結果の `detail` にその値が入るテスト
- [x] 4.5 既存のタイムアウト関連テストが定数ではなく渡した値を見る形に直っていることを
      確認する

## 5. 実機確認の待ちと、片付けの穴

- [x] 5.1 `scripts/stroke-check.ts` の `ROUND_TIMEOUT_MS` を、`nuxt.config.ts` から引いた
      `timeoutMs + timeoutStepMs * maxRetries` に余裕を足した値にする。`CLAUDE_TIMEOUT_MS`
      を名指しした doc コメントを追随させる（design.md Decision 6）

実機確認を回す中で、`--cleanup` が**要求どおりに片付けない**ことが分かった。要求は
「この実行で作ったセッションを最後に片付ける」（`stroke-check.ts` の `--cleanup` の記述）
であり、落ちたときに残るのは要求を満たしていない。残ったセッションは `phase` が
`stroking` のまま巡回に拾われて再キックされ続けるので、落ちたときこそ片付けが要る。

- [x] 5.2 片付けを成功経路から `finally` へ移す。セッション id は `run` の戻り値ではなく
      モジュール変数（`createdSession`）で持ち、id が分かった時点で覚える。承認まで
      進んだら改名後の名前へ差し替える（U10）
      （実測 2026-08-30: クラッシュした実行で `0885a26a-…` が消えた）
- [x] 5.3 SIGINT / SIGTERM / SIGHUP でも片付ける。`finally` は信号では走らない
      （実測 2026-08-30: SIGTERM で `2c8d8cf9-…` が消えた）

      **SIGINT だけは信号ハンドラを置いても片付かなかった。** Playwright は
      `chromium.launch()` の既定（`handleSIGINT: true`）で自前の SIGINT ハンドラを入れ、
      ブラウザを閉じ終えた**直後に `process.exit(130)` を呼ぶ**。こちらの片付けは
      ブラウザを閉じてからセッションを消すので、削除の手前で node が落ちていた。
      `chromium.launch({ handleSIGINT: false })` で塞いだ。SIGTERM / SIGHUP の
      ハンドラは exit を呼ばないので触っていない。

      再実測 2026-08-30（SIGINT）: `片付け: /opt/projects/a67135e6-… を消した` が出て、
      `yarn session list` も「セッションは残っていない」。

- [x] 5.6 片付けとサーバー側の実行の競合（削除の直後に `<uuid>/openspec/` だけの殻が
      作り直される）を、主題の持ち主である `adr0016-sub-add-stroke-check-approval-option`
      の tasks 6.1 へ移した。危険な故障（`state.json` が無いので一覧に載らず再キックも
      されない）は起きないことを確認済み。扱いはそちらで決める
- [x] 5.4 片付けを共有の promise（`teardownRun`）にして、2度目の呼び出しが「済んだこと」に
      せず同じ完了を待つようにする。素通しにすると、信号側の片付けが走っている最中に
      本流の例外が top-level へ抜け、node がそこで終了して片付けごと落ちる
      （実測 2026-08-30: 「片付けてから終わる」だけ出てディレクトリが残った）
- [x] 5.5 正常終了での片付けを実測で確認する（実測 2026-08-30: 着地した実行で
      `片付け: /opt/projects/fc612a85-… を消した`。これで3経路——クラッシュ・信号・
      正常終了——がすべて埋まった）

## 6. 検証・レビュー・締め

- [x] 6.1 `yarn typecheck` と `yarn test` が通ることを確認する（2026-08-30: 26 files /
      212 tests すべて green）
- [x] 6.2 `yarn check:stroke` で1往復し、既定値（刻み `0` = 現行と同じ振る舞い）で
      退行が無いことを実機で確認する

      **実測 2026-08-30**: 3往復して proposal に着地。既定の 180000ms 固定で走り、
      打ち切りは1回も起きていない（記録は `.stroke-check/fc612a85-….html`）。

      ```
      Q1 初期スコープ → CLI先行 / Q2 対応キー範囲 → 最小(3種) / Q3 対象ファイル → プロジェクトのみ
      往復: 3 / 着地: proposal に到達
      片付け: /opt/projects/fc612a85-… を消した
      ```

      着地までに5回落ちている。原因はこの change の外——同じマシンの別 worktree
      （`pre4`）が E2E を回しており、chrome プロセスが外部から SIGTERM（exitCode 143）
      される。claude も `stroke-check` も通さない最小スクリプト（ブラウザで dev の画面を
      開いて座るだけ）でも 2分13秒で renderer が死ぬことを確認した。

- [x] 6.3 `timeoutStepMs` に値を入れた実機確認（design.md Risks の1件目に対応する確認）。
      `timeoutMs: 5000` / `timeoutStepMs: 5000` を一時的に入れて必ず時間切れさせ、
      サーバーログで刻みが乗ることを見た。確認後に既定値（`180000` / `0`）へ戻した。

      **実測 2026-08-30**: 刻みは効いている。

      ```
      AI 呼び出しが失敗: 931af1ae-… [ 'タイムアウト (5000ms)' ]     ← retries 0
      AI 呼び出しが失敗: 931af1ae-… [ 'タイムアウト (10000ms)' ]    ← retries 1
      リトライ上限に達した: 931af1ae-…（3/2）                        ← error（終端）
      ```

      `retries` 0 で `timeoutMs` そのもの、1 で刻み1つぶんが乗る。`state.json` は
      `invocation: "error"` / `retries: 3` で終端に達した。

- [x] 6.3b **起動の総回数が資料と合わない**（`settings-reference.md` は「上限 + 1」＝3回、
      実測は claude の起動2回で `retries` が 3 に到達）。change `fix-retry-count-without-launch`
      として起票し、実測ログと `state.json` を ticket に添えた。

      打ち切りの長さの算出（この change の範囲）は実測どおり正しい。食い違うのは
      **起こし直しの数え方か、生出力の取りこぼし**のどちらかで、切り分けは向こうで行う。
      この change で入れたものではない。

      資料の側にも注記を入れた（`settings-reference.md` の総待ち時間の式の直下）。
      式は前提が崩れている可能性があるので、確定するまで数値を鵜呑みにさせない。
- [x] 6.4 '/santa-method' でレビューを実行し、指摘に対応する（独立2レビュアー × 3ラウンド。
      2026-08-30）

      | ラウンド | B | C | 主な critical |
      |---|---|---|---|
      | 1 | FAIL(4) | FAIL(2) | 設定の既定値の写しがスクリプトに増殖／id の記録が遅い／`approve` の応答取り逃しを成功扱い |
      | 2 | FAIL(1) | FAIL(2) | **SIGINT で片付かない**（実測付き）／**他人のプロジェクトを消しうる**／作成〜起動要求の窓 |
      | 3 | **PASS(0)** | FAIL(1) | 別 change の hunk が同居（＝ commit の帰属。6.5 で解消） |

      **コードの指摘はすべて閉じた。** 3ラウンド目に B の critical はゼロ。C の critical 1件は
      コードの欠陥ではなく積み方の話で、C 自身が示した対処（hunk の帰属を確定させる）を
      6.5 の4分割で実施した。santa-method の反復上限（3）に達したため、最終判定はユーザーへ
      委ねる（6.6）。

      潰した実害: 承認の応答取り逃しで**他人の同名プロジェクトを削除しうる**経路（phase 検査の
      無い削除）／**SIGINT で片付かない**（Playwright が先に `process.exit(130)` を呼ぶ）／
      セッション作成〜起動要求の窓での取りこぼし／設定の既定値の写し（`settings-reference.md:16`
      違反）／`removeSession` が無いパスでも「消した」と嘘をつく・`isSafeSegment` 未検査／
      `browser.close()` の無限待ちと逃げタイマーの `unref` 漏れ。
- [x] 6.5 この change の成果物を commit する（`51bf730`）

      **hunk の帰属どおり4本に切った。**

      | commit | 中身 | change |
      |---|---|---|
      | `51bf730` | タイムアウトの設定化（8ファイル ＋ `stroke-check.ts` の設定読みと `ROUND_TIMEOUT_MS`） | **この change** |
      | `dd86af9` | `settings-reference.md` の `debugLogDir` 節の追随 | `adr0016-sub-update-debug-log-per-session` |
      | `5d6cbb5` | `check:stroke` の片付けの修正と `removeSessionDir` の切り出し | `adr0016-sub-add-stroke-check-approval-option` |
      | `a90e4a4` | ADR-0016 への併走の追記と `.mcp.json` | `provide-operations-via-mcp` |

      `stroke-check.ts` の設定読みと `ROUND_TIMEOUT_MS` だけを `51bf730` に入れたのは、
      `CLAUDE_TIMEOUT_MS` を廃す以上、それを名指ししていた `ROUND_TIMEOUT_MS` を同じ
      commit で直さないと壊れるため。`51bf730` は単独で整合し、`session-core.ts` にも
      依存しない（`removeSessionDir` を使う片付けは `5d6cbb5` 側）。

      `.gitignore` は私の変更ではないので触っていない。

      **（記録）当初の見立て: 単独では積めない** `scripts/stroke-check.ts` の片付けは
      `server/utils/stroke/removeSessionDir` を import しているが、この export は
      未コミットの `server/utils/stroke/session-core.ts` で新設されたもので、**別 change
      のもの**である（`git show HEAD:server/utils/stroke/session-core.ts` に存在しない）。
      この change の8ファイルだけを積むと `yarn check:stroke` が import 解決に失敗する。
      さらに `scripts/stroke-check.ts` の差分には `--approve` / `waitForSteering` /
      `STEERING_DOCUMENTS` / `OPEN_ATTEMPTS` という別 change の作業が同居している。

      **`docs/specs/core/settings-reference.md` も1ファイル2 change である。** この change の
      hunk（`timeoutMs` / `timeoutStepMs` の2行・総待ち時間の式・「設定ではないもの」の表）の
      ほかに、`claude.debugLogDir` 節の書き換え（セッションごと1ファイル・
      `--output-format stream-json --verbose`）が混ざっている。これは
      `adr0016-sub-update-debug-log-per-session`（実装は `e4fc81f`）の資料追随であって、
      **この change の tasks 1.1〜1.4 にも design.md Decision 5 にも無い**。ADR-0004 は
      「settings-reference の編集は change を起こし、その change に承認を得る」と定めており、
      このまま積むと承認を経ていない編集がこの change の履歴に紛れる。

      commit の前に、どの change がどのファイル・どの hunk を持つかを確定させること。
- [x] 6.6 ユーザーから完了承認を得る（2026-08-30）
