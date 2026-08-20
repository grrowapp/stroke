# 未解消の事項

**まだ change に起こしていないもの**だけを置く。change を作ったらここから消す（実体は `openspec/changes/<change-id>/` に移る）。作業単位の管理は `docs/agents/issue-tracker.md` のとおり OpenSpec の change が担う。

## 既に change になっているもの

着手はこの順。3件とも `paths.ts` と `claude-config.ts` に触れるので並列に進められない。

1. `remove-store-dependency` — store 依存をやめ、cwd から openspec ルートを解決する
2. `externalize-hardcoded-settings` — 再ビルドなしに変えられない値 62 箇所を runtimeConfig へ
3. `add-session-lifecycle` — セッションを消せるようにする

先頭がセッションディレクトリの位置を確定させ、次がその位置を設定値へ出し、最後がそれを消す処理を足す。

---

## WS の URL 正規表現が `/api/` 前提になっている

`server/routes/api/[id]/ws/question.ts:11` と `server/routes/api/[id]/ws/proposal.ts:7` が、URL からセッション id を抜くのに `/api/<id>/ws/...` を直書きの正規表現でマッチしている。

リバースプロキシで base path を前置して配信する（例: `/stroke-board/api/...`）とマッチせず `null` になり、**WS が無言で閉じる**。W1・W2 は問いと proposal を画面へ届ける唯一の経路なので、機能が完全に沈黙する。しかも接続が閉じるだけでエラーが出ないため、原因が分かりにくい。

## プロジェクト名の連番採番に上限が無い

`server/utils/project.ts:59-61` の `for (let n = 2; ; n++)` は終了条件を持たない。既存名が多いと際限なく回る。

## コメントが実在しないファイルを指している

`server/utils/paths.ts:6` と `server/plugins/00.startup-checks.ts:22` のコメントが `server/plugins/00.writable.ts` を指しているが、実体は `00.startup-checks.ts`。
