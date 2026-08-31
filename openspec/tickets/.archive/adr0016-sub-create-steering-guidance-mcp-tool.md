---
status: ready-for-agent
tags:
  - enhancement
---

# adr0016-sub-create-steering-guidance-mcp-tool

steering 工程の案内が存在しない。`steeringPrompt` は実体の無いスキルを指している。案内を MCP ツールとして配る。

## 事実

ユーザー指示 2026-08-29。flontier 側の `adr0016-sub-create-flontier-guidance-mcp-tool` と対になる。

`nuxt.config.ts` の `steeringPrompt` は次のとおり。

```
steeringPrompt: '/write-steering-v2\n\nスキルの指示に従って steering 文書を作成する。'
```

**`write-steering-v2` はどこにも存在しない。** `.claude/skills/`（`settings.json` のみ）にも `assets/.claude/skills/` にも無い。`docs/specs/core/settings-reference.md` は「このリポジトリの `.claude/skills/` に在り」と書いているが、事実と違う。

同じ形の欠落が `firstPrompt` でも起きていた。`/openspec-ff-change` を先頭に置くと `Unknown command` となり、**初回起動は assistant のターンをひとつも持たずに終わっていた**（実測 2026-08-27）。`provide-operations-via-mcp` の tasks 4.7 で起動を外したが、`steeringPrompt` は「変更なし」として残してある。

steering 工程の足場は取得・提出とも未確認である。

- `mcp__stroke-board__get-steering` — **成功経路は一度も通っていない**
- `mcp__stroke-board__submit-document`（`type: steering`）— 同じく一度も通っていない
- 旧経路の `get-product` / `get-tech` / `get-structure` スキルは `assets/.claude/skills/` に在るが、`--add-dir` から外したのでロードされない（tasks 4.9）

つまり steering 工程は、取得も提出も案内も足場が無い状態にある。

## 求めるもの

- steering 工程の手順をエージェントへ渡すツール
- 引数を取らず、手順の本文を返す（flontier 側と同じ形）
- 手順に含めるもの: steering 文書3種（product / tech / structure）の作り方 / 取得と提出の順序 / 文書が無いときの進め方 / 承認との関係
- ツールの説明は、他のツールより先に呼ぶべきことを述べる

## 前提

- **flontier 側とツールを分けるか、1本で工程を見分けるかは未決。** モジュールは `server/mcp/tools/` を自動発見して単一の `/mcp` で全部配るため、工程ごとに出し分ける仕組みが今は無い
- `write-steering-v2` を Skill として作り直す案もありうる。ユーザー判断は「案内を MCP ツールで配る」（2026-08-29）
- 検証は `adr0016-sub-add-stroke-check-approval-option` の完了を待つ。`yarn check:stroke` が proposal で止まるため、承認後の steering 工程へ入れない
- `.claude/skills/` にスキルを置く場合は `--setting-sources` に `project` が要る（ADR-0001）
