---
status: ready-for-agent
tags:
  - maintenance
---

# adr0016-sub-update-debug-log-per-session

デバッグログが呼び出しごとに1ファイルで、1つのセッションを追うのに複数のファイルを開くことになる。

## 事実

実測（3往復のセッション1本、2026-08-28）:

```
/tmp/stroke-debug/20260828-012223-153-744aa80a-….json
/tmp/stroke-debug/20260828-012301-415-744aa80a-….json
/tmp/stroke-debug/20260828-012348-131-744aa80a-….json
/tmp/stroke-debug/20260828-012430-777-744aa80a-….json
```

往復が増えるほどファイルが増え、時系列に読むにはファイル名の時刻で並べ直す手間がかかる。並走したセッションのファイルも同じディレクトリに混ざる。

`claude-debug-logging` は「呼び出しごとに1ファイル」を Requirement に置いたが、この単位が調査の単位（セッション）と合っていない。

## あわせて直したこと

同じ調査の過程で、`--output-format` が `json` 固定だった点も直した。`json` は最終結果1件しか出さないため、ツールの呼び出しと結果がどこにも残らない。

実測 2026-08-28: MCP ツールが 500 で失敗し続けていたのに、サーバーのログにもデバッグログにも痕跡が無く、claude のセッション transcript（`~/.claude/projects/`）を jq で漁って初めて分かった。`claude-debug-logging` の Purpose「ユーザーレベルの transcript の手掘りに頼らず」が達成できていなかった。

`debugLogDir` が設定されているときだけ `stream-json` + `--verbose` にした。判定側（`readEnvelope`）は無変更で動く。stdout は最後の1塊だけを保持し、`stream-json` の最終行は `json` と同じ `type: "result"` のエンベロープであるため。

## 状態

change: `adr0016-sub-update-debug-log-per-session`（proposal / specs 作成済み、実装済み）

- `server/utils/stroke/claude.ts` — セッションごとに1ファイルへ追記。区切りは `# <日時>` の見出し行
- `test/server/utils/stroke/claude.test.ts` — ファイル数と追記の検証へ更新
