## 1. busy ガードのキーを作業場所の実体にする

- [x] 1.1 `server/utils/stroke/running.ts` に、作業場所ディレクトリから実行の枠のキーを引く導出を1本置く（`stat` の `dev`/`ino` から作る。design.md D2）。導出はここだけに置き、口ごとに書かない
- [x] 1.2 保存先の下の id からその導出を引ける形（id → パス → キー）を用意し、`sessionDir` / `projectDir` の使い分けが呼び出し側に散らないようにする
- [x] 1.3 `beginRun` / `endRun` / `isRunning` を、id ではなくキーで積む・外す・見る形に変える。`endRun` は `beginRun` が返したキーで解放する（実行中にディレクトリが消えても外せる）
- [x] 1.4 `stat` に失敗したときは枠を取らずにそのまま投げる。既定値で補って別のキーに落ちる経路を作らない（design.md Risks）
- [x] 1.5 `running.ts` の docblock を書き直す。「セッション単位」ではなく「作業場所の実体単位」であること、なぜ id では足りないか（改名で id が変わっても実体は同じ）を書く

## 2. 起動・削除の口を新しいキーへ揃える

- [x] 2.1 `server/api/strokes/[id]/invoke-agent.get.ts`（U13）を、cwd を決めた**後**にその cwd からキーを引いて `beginRun` する順序に直す。`.finally` の `endRun` も同じキーにする
- [x] 2.2 `server/api/sessions/[id]/index.delete.ts`（U11）の `isRunning(sessionId)` を、同じ導出で引いたキーでの判定に変える
- [x] 2.3 `server/api/projects/[projectId]/index.delete.ts`（P1）の `isRunning(name)` を、同じ導出で引いたキーでの判定に変える
- [x] 2.4 4つの口（U13・U11・P1・次の 3.x の U10）が同じ1つの事実を見ていることを、コメントで1箇所に集約する（口ごとに理由を写経しない）

## 3. 承認が走行中の実行と競合しないようにする

- [x] 3.1 `server/api/strokes/[id]/approve.post.ts` に、昇格の前の実行中チェックを入れる。実行中なら `conflict('busy', …)` で断り、**何も変えずに**返す（specs `api/session/approve`）
- [x] 3.2 チェックを `isRunning` の参照ではなく `beginRun`（枠の占有）で行う。確認から改名完了までを、起動が割り込めない1区間にする（design.md D3）
- [x] 3.3 占有の解放を、昇格の成否によらず行う。解放は**steering の起動（U13）を叩く前**に置く——改名後の U13 は同じキーを取りに来るため（design.md D3 の順序 4→5）
- [x] 3.4 既存の巻き戻し（`phase` 書き込み失敗 → `revertPromotion`）と占有の解放が二重にならない形にする。失敗の経路でも枠が残らないことを確かめる
- [x] 3.5 busy の文言を、待てば通ることが伝わる形にする（画面は `warn('承認できませんでした', …)` に本文を続けて出す。専用の器は作らない）
- [x] 3.6 `approve.post.ts` の docblock「busy ガードは U7・U9 のみ。承認はエージェントの呼び出しを起動しないため対象にしない」を書き直す。承認が対象になった理由（改名が走っている呼び出しの足元を動かす）を書く

## 4. テスト

- [x] 4.1 `test/server/utils/stroke/` にキーの導出のテストを足す。改名の前後の2つのパスが**同じキー**になること、別のディレクトリが**違うキー**になることを見る
- [x] 4.2 U13 の多重起動テストを足す。同じ実体のディレクトリに対し、異なる id で2つ目の起動を要求すると busy で断られること（specs `api/session/invoke-agent`）
- [x] 4.3 承認のテストを足す。実行中に承認が届くと 409 busy で断られ、**ディレクトリは改名されず `phase` も `proposed` のまま**であること
- [x] 4.4 承認のテストを足す。実行が終わった後の承認は通り、昇格の後に steering の起動が受理されること（占有が自分の起動を妨げないこと・design.md D3）
- [x] 4.5 削除（U11・P1）が起動と同じ事実で busy を判定していることのテストを足す
- [x] 4.6 既存テスト（`promotion-order.test.ts` / `project.test.ts` / `invoke.test.ts`）が新しい順序と非同期化した `beginRun` で通ることを確かめ、必要なら追随させる（3ファイルとも変更不要で 33 件パス）
- [x] 4.7 `yarn test` と `yarn lint`（`yarn typecheck` があれば併せて）を通す（`yarn lint` は存在しない。`yarn test` 776 件パス・`yarn typecheck` 通過）

## 5. 実機での確認

- [ ] 5.1 `yarn check:stroke --approve` を通す。`scripts/stroke-check.ts` の `approve()` は今も実行の終わりを待つが、待たせずに承認を投げた場合に 409 busy で断られることも一度手で確かめる
- [x] 5.2 `scripts/stroke-check.ts` の `approve()` のコメント「**承認そのものに busy ガードは無い**（`approve.post.ts`「busy ガードは U7・U9 のみ…」）」を実装に合わせて直す。実行の終わりを待つ理由（断られずに一度で通したい）に書き換える
- [x] 5.3 起動したものを止め、ポートと一時ファイルを片付ける
  - （実測 2026-09-01: `yarn dev`（PID 379862、3599）を `kill -TERM` で停止し `ss -tlnp | grep 3599` 該当なし＝ポート解放を確認。`claude.debugLogDir` を `''` に戻し、デバッグログファイルを削除して残0件を確認した）

## 6. 上位資料への整合反映（change update-docs-for-runtime-fixes へ委譲済み）

- [x] 6.1 上位資料への整合反映を change `update-docs-for-runtime-fixes` へ委譲した。提案の内容は同 change の ticket に一覧（この change の分は `C1` / `C2` / `C3`）。**この change では `docs/` を書き換えない**

## 7. 締め

- [x] 7.1 `openspec validate fix-rename-during-running-session --store stroke` が通ることを確かめる
- [ ] 7.2 実装の成果物をこの worktree のブランチへコミットする
- [ ] 7.3 `typescript-reviewer` エージェントに `/santa-method` でレビューさせる。**完全にパスするまで続ける**（指摘が出たら直して再実行する）
- [ ] 7.4 ユーザーから完了承認を得る
