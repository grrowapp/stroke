## 1. 走っている実行を見つける口

- [x] 1.1 走っているプロセスの一覧（pid と argv）を取る口を `server/utils/stroke/` に作る。取れなかったときは「判定できない」として返し、例外で巡回や起動を止めない
- [x] 1.2 argv から「自分が起こした claude か」を判定する照合を書く。手がかりは自インスタンスの `claude.apiBaseUrl`（`--mcp-config` の `url`）。design.md Decision 2
- [x] 1.3 argv から「どの対象の実行か」を判定する照合を書く。ストロークは `--session-id` / `--resume` の uuid、steering は `--resume` の `runId` と `--mcp-config` に載る cwd。design.md Decision 1
- [x] 1.4 `invoke.ts` が組み立てる argv と 1.2 / 1.3 の照合が同じ事実を見ていることをテストで固定する（組み立て → 照合 → 一致）

## 2. 起動時の後始末

- [x] 2.1 後始末を専用の起動時プラグイン（`server/plugins/01.reap-running.ts`）へ切り出す。巡回プラグインからは初回周回の `running` 掃除を取り除く。design.md Decision 3
- [x] 2.2 一覧（U12）の `running` の各件について、1.1〜1.3 で走っている claude を探す。**参照は API の応答から得る**（ファイルを直接読まない）
- [x] 2.3 自分が起こしたものが走っていたら `SIGKILL` で終了させ、終了を確かめてから A8 で `failed` を書く。design.md Decision 5
- [x] 2.4 走っていなければそのまま A8 で `failed` を書く
- [x] 2.5 終了させられなかった／判定できなかった件は A8 で `error` を書く。`failed` にはしない。design.md Decision 4
- [x] 2.6 自分が起こしたと確かめられない実行（別インスタンスのもの）には触らない。`invocation` も書き換えない
- [x] 2.7 後始末の結果をログに出す（止めた件数・`failed` にした件数・`error` にした件数・触らなかった件数）

## 3. 順序の担保

- [x] 3.1 巡回プラグイン（`server/plugins/01.retry-failed.ts`）が、最初の周回を後始末の完了後に始めるようにする。後始末が終わるまで U13 を叩かない
- [x] 3.2 後始末が失敗して終わった場合も巡回が動き出せるようにする（後始末の失敗で巡回が永久に止まらない）。ただし後始末で `error` にした件は巡回が拾わない
- [x] 3.3 `server/utils/stroke/sweep.ts` の doc コメントが巡回を `server/plugins/02.retry-failed.ts` と書いている食い違いを直す（実体は `01.`）。design.md「上位資料への整合反映」3 —— 確認したところ、現行の `sweep.ts` の doc コメントは既に `server/plugins/01.retry-failed.ts` を指しており、`02.` の記述は残っていなかった（コード側は既に一致。`02.` の記述が残るのは `docs/specs/api/contract.md` 側だが、そちらは docs でありこの change のタスクの対象外）。コード変更なし

## 4. テスト

- [x] 4.1 「走っている自分の claude を止めてから `failed` にする」をテストで固定する
- [x] 4.2 「プロセスがもう無い `running` はそのまま `failed`」をテストで固定する
- [x] 4.3 「止められない／判定できないときは `error`、自動で起こし直さない」をテストで固定する
- [x] 4.4 「別インスタンスが起こした実行には触らない（止めない・記録を書き換えない）」をテストで固定する
- [x] 4.5 二重起動を防いでいるのは、プラグイン間の待ち合わせではなく**対象1件ごとの順序**——後始末（`reap.ts` の `reapRunning`）が、走っている claude の終了を確かめてから `invocation` を `failed` へ変える分岐——である。この分岐は `reap.test.ts` の「走っている自分の claude を止めてから `failed` にする」（4.1 に対応）で固定済み。プラグイン間の順序を取り決める仕組み（`reap-gate.ts` の `beginReap` / `awaitReap`）は、根拠が成り立たないため change `remove-startup-reap-ordering` で削除した——巡回は `invocation === 'failed'` の対象しか拾わず（`shouldRetry`）、後始末がまだ `failed` へ変えていない対象（`running` のまま）に巡回が触れることはないので、待ち合わせは元から不要だった
- [ ] 4.6 `yarn test` と `yarn check:stroke` が通ることを確かめる。起動したもの・作ったセッションは必ず片づける —— `yarn test` は実行し全件通過を確認済み（808 tests passed）。`yarn check:stroke` はユーザー指示により実行していない（実機を1周させるタスクのため停止・報告）

## 5. 実機での確認

- [ ] 5.1 実行中に dev サーバーを再起動し、残っていた claude が終了していること・`invocation` が `failed` になっていること・同じ会話に2つ目の claude が立たないことを確かめる（`ps -ww -e -o pid=,args=` で claude の残りを目視）
- [ ] 5.2 3399 と 3599 を並走させ、片方を再起動しても**もう片方の走っている実行が止まらない・`invocation` が書き換わらない**ことを確かめる

## 6. 上位資料への整合反映（change update-docs-for-runtime-fixes へ委譲済み）

- [x] 6.1 上位資料への整合反映を change `update-docs-for-runtime-fixes` へ委譲した。提案の内容は同 change の ticket に一覧（この change の分は `S1` / `S2`）。**この change では `docs/` を書き換えない**

## 7. レビューと完了

- [ ] 7.1 `typescript-reviewer` エージェントに `/santa-method` でレビューさせる。**完全にパスするまで繰り返す**
- [ ] 7.2 ユーザーから完了承認を得る
