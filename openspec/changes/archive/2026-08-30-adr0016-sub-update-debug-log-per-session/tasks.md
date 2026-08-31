# adr0016-sub-update-debug-log-per-session — tasks

実装は `e4fc81f`（`fix: claude の生出力にツール呼び出しを残し、ログをセッション単位にする`）
で入っている。チェック済みの項目は、そのコミットの差分と現在のコードで確認したもの
（突き合わせ 2026-08-30）。

## 1. 出力形式

- [x] 1.1 `runClaude` の起動フラグを、`debugLogDir` が渡っているときだけ
      `--output-format stream-json --verbose`、渡っていなければ従来の
      `--output-format json` にする（`server/utils/stroke/claude.ts`。design.md Decision 3）

## 2. 生出力の取り込み

- [x] 2.1 `child.stdout` の chunk を改行で塊に切り出す。行の途中で切れた分は `pending` に
      残して次の chunk と繋ぐ。空行は塊にしない（design.md Decision 5）
- [x] 2.2 判定用の `stdout` は最後の1塊だけを持ち（追記ではなく上書き）、ログ用の
      `events` に全塊を届いた順で溜める（design.md Decision 4）
- [x] 2.3 `child.stdout` の `'end'` で `pending` の残りを取り込む。末尾に改行が来ない
      出力で最後の塊を落とさない（design.md Decision 5）
- [x] 2.4 `readEnvelope` と成否の判定に手を入れないことを確認する
      （`agent/invocation`「完了は output stream で検知して idle に変える」）

## 3. ログの書き出し

- [x] 3.1 書き出す中身の組み立てを `formatDebugLog(events)` に切り出す。届いた塊を改行で
      繋ぐだけにし、末尾に改行を足さない（design.md Decision 6）
- [x] 3.2 `writeDebugLog` の出力先を `<dir>/<セッション uuid>.json` に変え、`writeFile`
      （`wx`）を `appendFile` へ替えて追記にする（design.md Decision 1）
- [x] 3.3 1回ぶんの記録を `# <YYYY-MM-DD HH:mm:ss.SSS>` の見出し行で区切る
      （`debugLogEntry`。旧 `debugLogStamp` を置き換える。design.md Decision 2）
- [x] 3.4 書き出しを呼び出しの完了処理から切り離したまま（`await` しない）、失敗は警告
      1行だけで結果へ反映しない扱いを維持する（`debug/logging` の既存 Requirement）

## 4. タイムアウト

- [x] 4.1 `CLAUDE_TIMEOUT_MS` を 600000 から 180000 へ戻し、根拠（実測 2026-08-28: 8回で
      28.5〜64.7 秒）を doc コメントに残す（design.md Decision 7）

      **この定数はその後 `adr0016-sub-add-timeout-to-config` で廃止された**（2026-08-30）。
      値 `180000` と根拠のコメントは `nuxt.config.ts` の `runtimeConfig.claude.timeoutMs`
      へ移り、設定の正（`docs/specs/core/settings-reference.md`）に載っている。
      この change がここで置いた値と根拠はそのまま生きている。

## 5. テスト

`test/server/utils/stroke/claude.test.ts`。

- [x] 5.1 セッションごとに1ファイルへ追記され、前の呼び出しが失われないテスト
      （2回呼んでファイルは `<uuid>.json` の1つのまま・1回目のエンベロープが残る・
      見出し行が2本）
- [x] 5.2 失敗した呼び出し（非ゼロ終了）でも `<uuid>.json` に残るテスト
- [x] 5.3 出力先を渡したときだけ `stream-json` と `--verbose` で起こすテスト
- [x] 5.4 出力先を渡さなければ `stream-json` にも `--verbose` にもしないテスト
- [x] 5.5 出力先が未設定なら何も書かれないテスト（既存を維持）
- [x] 5.6 出力先へ書けなくても呼び出しは成功のまま、警告が1行出るテスト（既存を維持）

## 6. ドキュメント

- [x] 6.1 `docs/specs/core/settings-reference.md` の `claude.debugLogDir` の説明
      （「`--output-format json` の stdout 全文」）を、出力先を設定したときは
      `stream-json` になる旨へ直す。設定の正への修正なのでユーザー承認を得てから反映する
      （ADR-0004。design.md Migration Plan）

## 7. 検証・レビュー・締め

- [x] 7.1 実サーバーで1往復し、`<uuid>.json` へ追記されること・見出し行で区切られること・
      `tool_use` / `tool_result` が残ることを実測で確認する
      （実測 2026-08-29: `.stroke-check/debug-log/` の2ファイルで確認）
- [x] 7.2 `yarn typecheck` と `yarn test` が通ることを確認する
      （2026-08-30 に再確認: 29 files / 231 tests すべて green）
- [x] 7.3 '/santa-method' でレビューを実行し、指摘に対応する（独立2レビュアー・2026-08-30）

      **両者 FAIL。critical は4件で、2人の指摘が完全に一致した。** すべて対応済み。

      1. **delta が archive を壊す。** `## MODIFIED Requirements` の見出しが living spec に
         存在しない新しい名前で、MODIFIED は見出しで既存 Requirement を特定して差し替える
         操作である。このまま archive すると旧 Requirement（呼び出しごとに1ファイル・
         ファイル名は `<時刻>-<uuid>.json`）が消えずに残り、新旧が矛盾したまま並ぶ
         → **MODIFIED（Requirement 1）＋ REMOVED ＋ ADDED へ組み直した**
      2. **delta が触っていない Requirement 1 の Scenario が実装と食い違う。** 「中身は
         `--output-format json` で stdout へ出した全文と一致する」のままで、実装は
         `stream-json`・見出し行付き・2回目以降はファイルが増えない
         → **その Requirement を MODIFIED に含め、ツールの呼び出しが残ることも規範に足した**
      3. `claude.ts` に旧ファイル名規約を断言する JSDoc が残っていた（この change が廃した
         規約を、廃したコミット自身が書き残していた） → 削除
      4. **Decision 4（判定用 stdout は最後の1塊）を検証するテストが1本も無い。** 複数行を
         出す唯一のテストが `runClaude` の戻り値を捨てていた。連結する実装へ戻しても全テストが
         green のままだった（実運用では `readEnvelope` が必ず null になり全呼び出しが失敗する）
         → `expect(result).toEqual({ ok: true, sessionId })` を追加。あわせて「末尾に改行を
         足さない」を実際に押さえるテストも足した（コメントが嘘の根拠を挙げていた）

- [x] 7.4 **レビューが見つけた波及**: `scripts/stroke-check.ts` の `settle()` が実行の終了を
      「デバッグログの**ファイル数**が増えたか」で見ていた。この change 以降、同じセッションでは
      ファイルが増えないので、**2往復目からは必ず時間切れまで待つ**。実測 2026-08-30 の実行ログでも
      毎回「実行の終了を確認できないまま答える」に落ちていた。呼び出しの回数は `# <日時>` の
      見出し行の本数で数える（`logEntryCount`）形に直した。

- [x] 7.5 この change の成果物を commit する（実装は `e4fc81f`、7.3 / 7.4 の対応は `44edefa`）
- [x] 7.6 ユーザーから完了承認を得る（2026-08-30）
