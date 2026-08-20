# 未解消の事項

**まだ change に起こしていないもの**だけを置く。change を作ったらここから消す（実体は `openspec/changes/<change-id>/` に移る）。作業単位の管理は `docs/agents/issue-tracker.md` のとおり OpenSpec の change が担う。

## 既に change になっているもの

着手はこの順。3件とも `paths.ts` と `claude-config.ts` に触れるので並列に進められない。

1. `remove-store-dependency` — store 依存をやめ、cwd から openspec ルートを解決する
2. `externalize-hardcoded-settings` — 直書きされた設定値 62 箇所を残らず runtimeConfig へ。WS の URL からセッション id を抜く正規表現も含むので、サブパス配信で接続が無言で閉じる問題もここで解ける
3. `add-session-lifecycle` — セッションを消せるようにする

先頭がセッションディレクトリの位置を確定させ、次がその位置を設定値へ出し、最後がそれを消す処理を足す。

---

## プロジェクト名の連番採番に上限が無い

`server/utils/project.ts:59-61` の `for (let n = 2; ; n++)` は終了条件を持たない。既存名が多いと際限なく回る。

## コメントが実在しないファイルを指している

`server/utils/paths.ts:6` と `server/plugins/00.startup-checks.ts:22` のコメントが `server/plugins/00.writable.ts` を指しているが、実体は `00.startup-checks.ts`。
