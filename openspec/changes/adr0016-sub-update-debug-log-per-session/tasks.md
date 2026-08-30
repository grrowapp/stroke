# adr0016-sub-update-debug-log-per-session — tasks

実装は `e4fc81f`（`fix: claude の生出力にツール呼び出しを残し、ログをセッション単位にする`）
で入っている。チェック済みの項目は、そのコミットの差分と現在のコードで確認したもの。

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

- [ ] 6.1 `docs/specs/core/settings-reference.md` の `claude.debugLogDir` の説明
      （「`--output-format json` の stdout 全文」）を、出力先を設定したときは
      `stream-json` になる旨へ直す。設定の正への修正なのでユーザー承認を得てから反映する
      （ADR-0004。design.md Migration Plan）

## 7. 検証・レビュー・締め

- [x] 7.1 実サーバーで1往復し、`<uuid>.json` へ追記されること・見出し行で区切られること・
      `tool_use` / `tool_result` が残ることを実測で確認する
      （実測 2026-08-29: `.stroke-check/debug-log/` の2ファイルで確認）
- [ ] 7.2 `yarn typecheck` と `yarn test` が通ることを確認する
- [ ] 7.3 'typescript-reviewer' エージェントに '/santa-method' でレビューを実行し、
      完全にパスするまで指摘対応を続ける
- [x] 7.4 この change の成果物を commit する（`e4fc81f`）
- [ ] 7.5 ユーザーから完了承認を得る
