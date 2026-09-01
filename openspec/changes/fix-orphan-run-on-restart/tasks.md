## 1. 走っている実行を見つける口

- [ ] 1.1 走っているプロセスの一覧（pid と argv）を取る口を `server/utils/stroke/` に作る。取れなかったときは「判定できない」として返し、例外で巡回や起動を止めない
- [ ] 1.2 argv から「自分が起こした claude か」を判定する照合を書く。手がかりは自インスタンスの `claude.apiBaseUrl`（`--mcp-config` の `url`）。design.md Decision 2
- [ ] 1.3 argv から「どの対象の実行か」を判定する照合を書く。ストロークは `--session-id` / `--resume` の uuid、steering は `--resume` の `runId` と `--mcp-config` に載る cwd。design.md Decision 1
- [ ] 1.4 `invoke.ts` が組み立てる argv と 1.2 / 1.3 の照合が同じ事実を見ていることをテストで固定する（組み立て → 照合 → 一致）

## 2. 起動時の後始末

- [ ] 2.1 後始末を専用の起動時プラグイン（`server/plugins/01.reap-running.ts`）へ切り出す。巡回プラグインからは初回周回の `running` 掃除を取り除く。design.md Decision 3
- [ ] 2.2 一覧（U12）の `running` の各件について、1.1〜1.3 で走っている claude を探す。**参照は API の応答から得る**（ファイルを直接読まない）
- [ ] 2.3 自分が起こしたものが走っていたら `SIGKILL` で終了させ、終了を確かめてから A8 で `failed` を書く。design.md Decision 5
- [ ] 2.4 走っていなければそのまま A8 で `failed` を書く
- [ ] 2.5 終了させられなかった／判定できなかった件は A8 で `error` を書く。`failed` にはしない。design.md Decision 4
- [ ] 2.6 自分が起こしたと確かめられない実行（別インスタンスのもの）には触らない。`invocation` も書き換えない
- [ ] 2.7 後始末の結果をログに出す（止めた件数・`failed` にした件数・`error` にした件数・触らなかった件数）

## 3. 順序の担保

- [ ] 3.1 巡回プラグイン（`server/plugins/01.retry-failed.ts`）が、最初の周回を後始末の完了後に始めるようにする。後始末が終わるまで U13 を叩かない
- [ ] 3.2 後始末が失敗して終わった場合も巡回が動き出せるようにする（後始末の失敗で巡回が永久に止まらない）。ただし後始末で `error` にした件は巡回が拾わない
- [ ] 3.3 `server/utils/stroke/sweep.ts` の doc コメントが巡回を `server/plugins/02.retry-failed.ts` と書いている食い違いを直す（実体は `01.`）。design.md「上位資料への整合反映」3

## 4. テスト

- [ ] 4.1 「走っている自分の claude を止めてから `failed` にする」をテストで固定する
- [ ] 4.2 「プロセスがもう無い `running` はそのまま `failed`」をテストで固定する
- [ ] 4.3 「止められない／判定できないときは `error`、自動で起こし直さない」をテストで固定する
- [ ] 4.4 「別インスタンスが起こした実行には触らない（止めない・記録を書き換えない）」をテストで固定する
- [ ] 4.5 「後始末が済むまで巡回が U13 を叩かない」をテストで固定する
- [ ] 4.6 `yarn test` と `yarn check:stroke` が通ることを確かめる。起動したもの・作ったセッションは必ず片づける

## 5. 実機での確認

- [ ] 5.1 実行中に dev サーバーを再起動し、残っていた claude が終了していること・`invocation` が `failed` になっていること・同じ会話に2つ目の claude が立たないことを確かめる（`ps -ww -e -o pid=,args=` で claude の残りを目視）
- [ ] 5.2 3399 と 3599 を並走させ、片方を再起動しても**もう片方の走っている実行が止まらない・`invocation` が書き換わらない**ことを確かめる

## 6. 上位資料への整合反映

- [ ] 6.1 design.md「上位資料への整合反映」1・2（`docs/specs/architecture/session-workflow.md`）をユーザーに提案し、**承認を得る**
- [ ] 6.2 承認された内容だけを `docs/specs/architecture/session-workflow.md` へ反映する。承認前は書き換えない

## 7. レビューと完了

- [ ] 7.1 `typescript-reviewer` エージェントに `/santa-method` でレビューさせる。**完全にパスするまで繰り返す**
- [ ] 7.2 ユーザーから完了承認を得る
