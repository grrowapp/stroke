---
tags:
  - document
status: Open
order: 0.0
---

# adr0018-sub-update-feature-workflow

先日 `docs/` に置いた feature のワークフロー定義に、**大きめの修正を入れる**。定義の中身そのものを見直す change であり、誤記の訂正や整形ではない。

`create-feature` から切り出した（[ADR-0018](../../docs/adr/0018-delegate-create-feature.md)）。区分は**前提**。`create-feature` は proposal 段階で「確定した仕様定義への完全準拠」を宣言しているため、定義が動くとその範囲も動く。

触るファイル:
- 更新 `docs/specs/plan/feature/overview.md`
- 更新 `docs/specs/plan/feature/feature-workflow.md`
- 更新 `openspec/specs/feature/`（`naming` / `structure` / `workflow/overview` / `workflow/sync` の4 capability。定義を動かすなら delta が要る）

## 修正の中身

**未記録。** ユーザーから内容を受けてここに書く。

## 起票時点で確認済みの事実

修正の出発点として、現状で分かっていることを記録しておく。これらが修正の全量という意味ではない。

### 定義を名乗る文書が2つある

いずれも冒頭で「本書は feature レーンの正である」と書き、命名の節でも「本書のこの節が命名の正である」と書いている。食い違いは4点。

| 論点 | `overview.md` | `feature-workflow.md` |
|---|---|---|
| 戻す接合の delta 変換 | 変換を**しない**（`:104`） | 変換を**含む**（`:67`） |
| change : capability | **1 : N**。正は proposal の Capabilities 節（`:73-74`） | feature の器 = change 相当。実質 **1 : 1**（`:103` `:116`） |
| 本家 unarchive 後の扱い | 「archive からの戻し」。`update-<feature名>` を自動起票（`:107-159`） | 「**孤児 / 逆孤児**」。検出して表示するのみ、修復はユーザー操作（`:70-97`） |
| ticket のファイル名 | **change 名**（`:75`） | **spec 名**の `__` 置換（例 `api__session.md`）（`:107`） |

由来は、change `define-feature-workflow`（2026-08-27 承認・archive 済み）が `docs/feature/overview.md` を作って CLAUDE.md の索引にも登録したが、**旧版を落とすタスクを持たなかった**こと。旧版は `6331b22` で入ったまま `docs/specs/architecture/` に残り、一度も更新されていない。

2026-08-29、両者を `docs/specs/plan/feature/` へ並べた（中身は一字も変えていない）。

### 定義自身が未決を4件抱えている

`overview.md` の「後続で決めること」。

- 工程の間の、change の成果物と本家の器の中身の同期のさせ方
- 締め（戻す接合と openspec 側の sync → archive）の実行の担い手
- update change の起票の詳細（命名の確定・自演ガードの実装）
- 最初の回（確定した仕様がまだ無い作業中の feature）の change ↔ capability の対応の引き方

### 確定済みの capability spec がある

`openspec/specs/feature/` に4本が `sync` 済み（`naming` / `structure` / `workflow/overview` / `workflow/sync`）。定義を動かすなら、こちらへの delta が要る。

## 関連

`adr0018-sub-update-artifact-extension-plan` と独立ではない。定義側が `proposal.md` の配置（`overview.md:84`）をやめる決着になれば、あちらの範囲は縮む。
