---
tags:
  - bug
status: Open
order: -5.0
---

# restrict-agent-add-dir-scope

セッション工程のエージェントが stroke-board 自身のリポジトリを読める。自分の検証ログまで読みに行く。

## 事実

`nuxt.config.ts` の起動定義は `--add-dir` にリポジトリのルートを渡している。

```
'--add-dir', import.meta.dirname,
```

案内スキル（`/openspec-ff-change`・`/write-steering-v2`）と opsx コマンドの置き場として渡しているが、渡るのはルート全体である。エージェントは stroke-board のソース・設計文書・他 change の proposal・**自分が今生成している検証ログ**まで見られる。

実測 2026-08-29（`yarn check:stroke` のセッション `167cb9d2-…`、`d823166d-…`）。差し戻しの指摘に応えようとした直後から探索が始まった。

```
Bash: ls -la /home/vagrant/work/stroke-board/pre5 && find ... -maxdepth 3 -type f | head -100
Read: /home/vagrant/work/stroke-board/pre5/shared/stroke.ts
Read: /home/vagrant/work/stroke-board/pre5/CONTEXT.md
Read: /home/vagrant/work/stroke-board/pre5/docs/specs/architecture/question-flow.md
Read: /home/vagrant/work/stroke-board/pre5/.spec-workflow/approvals/provide-operations-via-mcp/.snapshots/proposal.md
Bash: grep -l "proposal" /home/vagrant/work/stroke-board/pre5/.stroke-check/debug-log/*.json
```

エージェントの仕事は**利用者が出した概要から proposal を起こすこと**であり、stroke-board の実装は関係ない。3つの害がある。

1. **無関係な文脈が proposal に混ざる。** 読んだものを設計判断の材料にしうる
2. **検証が自己参照になる。** `.stroke-check/debug-log/` は、そのエージェント自身の呼び出し記録である。読ませたまま合否を測ると、成果物の評価が成り立たない
3. **ターンを浪費する。** 探索に費やした分だけ往復が進まない

なお取得・提出は MCP ツール経由のみで、`provide-operations-via-mcp` の 5.1 合格条件2 には抵触していない。これは**別の欠陥**である。

## 求めるもの

- エージェントに渡す作業ディレクトリを、仕事に要る範囲へ絞る
- 案内スキルは引き続きロードできる（`Skill` を外さない。`nuxt.config.ts` のコメント参照）
- セッションのディレクトリ（`projectShareRoot` 配下の自分のセッション）は読み書きできる

## 前提

- 操作系スキルの置き場（`assets/.claude/skills/`）は既に `--add-dir` から外してある（`provide-operations-via-mcp` の tasks 4.9）。本件はもう1つの `--add-dir`（リポジトリルート）の話である
- `--setting-sources` から `project` を外すとスキルが一切ロードされない（ADR-0001）。案内スキルを残したまま範囲を絞る方法が要る
