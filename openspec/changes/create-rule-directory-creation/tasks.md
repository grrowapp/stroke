## 1. 規定を置く

- [x] 1.1 `docs/agents/issue-tracker.md` に「## フォルダの新規作成 / ### repo 直下」を追加する。自己判断での作成の禁止・例外3つ・③の報告義務を書く。位置は「更新対応」と「過去の記録」の間
- [x] 1.2 `CLAUDE.md` に要点を抜粋し、正が `docs/agents/issue-tracker.md` であることを明記する。位置は「Worktree 運用」と「Docs」の間
- [x] 1.3 2つの記述が食い違っていないことを確かめる（例外の数・③の報告義務・直下のみを対象とする範囲）

## 2. コミット

- [ ] 2.1 pre6 のブランチへ直接コミットする（`CLAUDE.md`「change の実装（apply）は、この worktree のブランチへ直接コミットする」）。change と ticket は openspec root（`/opt/projects/stroke-board`）側にあり、このコミットには乗らない

## 3. レビューと完了承認

- [ ] 3.1 `typescript-reviewer` エージェントに `/santa-method` でレビューを実行する。対象はこの change の成果物（`docs/agents/issue-tracker.md` と `CLAUDE.md` の追加分）と、両者の整合。レビューが完全にパスするまで続ける
- [ ] 3.2 ユーザーから完了承認を得る
