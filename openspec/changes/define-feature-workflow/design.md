## Context

動機は proposal.md の Why を参照。設計の前提になる事実は次の通り。

- 本家 `.spec-workflow/specs/` はフラット必須。入れ子は一覧に出ず、watcher が親 spec を汚す（実測 2026-08-26、`docs/specs/reference/upstream-observations.md`）
- openspec のローカル schema は artifact の名前・順序・生成ファイルを自由に定義できる（検証済み。実例 `openspec/schemas/flontier-steering`）
- ポータルと feature を繋ぐ全体の設計（作成の口・内容充填の工程・実装の流れ）はまだ動いている。`create-feature` は proposal 段階で、内容充填の change は未起票

## Goals / Non-Goals

**Goals:**

- feature ワークフローの全体設計（流れ・対応モデル）を示し、それを定義文書に落とす
- 未決の事項を未決のまま明示し、後で決める場所（実装時の設計）を指す

**Non-Goals:**

- feature 用 schema の実体の作成（中身の詳細は実装時の設計）
- sync の実装（発火・担い手が全体の設計に依存するため）
- 工程の間の、change の成果物と本家の器の中身の同期のさせ方の決定

## Feature ワークフローの全体設計

### 流れ

```
ポータル（create-feature が口を実装）
  │ 作成。名前は `__` 規約でエンコード（feature/naming）
  ▼
.spec-workflow/specs/<spec名>/            ← 器（feature/structure）
  ├ requirements.md
  ├ design.md
  └ tasks.md
  │ 内容の充填 〜 実装。工程は schema の外部定義で決まる
  │ （feature/workflow/overview。schema の中身は実装時の設計）
  │ tasks 全完了
  ▼
本家の archive（spec-workflow が元々持つ機能）
  │ requirements.md を openspec/changes/<change-id>/ へ移す（戻す接合）
  ▼
openspec 標準の sync → archive
  │ change 内の delta（specs/<階層パス>/）がそのまま反映される
  ▼
openspec/specs/<階層パス>/spec.md   ← 確定した仕様の置き場
```

feature の一生はこの一本道であり、specs の4 capability は流れの各所（名前・器・工程・最終段）をそれぞれ縛る。

### 本家の器と openspec の概念の対応

| 本家の器 | openspec の概念 | 備考 |
|---|---|---|
| `.spec-workflow/specs/<spec名>/` | change に相当する作業単位 | 作業中の実体をどちらに持つかは未決 |
| `requirements.md` | spec（Requirement + Scenario） | 概念がほぼ同じ。「openspec の spec が名前を変えたもの」が最も近いイメージ。requirements 側はスコープが粗め。形式まで縛るかは未決 |
| `design.md` | change の design | |
| `tasks.md` | change の tasks | |
| tasks 全完了 → 本家の archive | sync → archive | 本家 archive で requirements が change へ戻り、sync で `openspec/specs/` が育ち、archive で締まる |

本家の枠組みを器として使い、概念の整理は openspec 側に合わせる。この対応が「spec-workflow-mcp の皮を被った openspec 実装」というイメージの中身である。

### 2レーンでの位置づけ

- **feature レーン**: 上記の流れ。実装のタスクに繋がる
- **仕様書レーン**: proposal → spec（形が少し違う）→ design。tasks 無し。最後に `docs/specs/` へ同期——という仮決めのみ。scope 外で、器は `define-spec-document-workflow` に用意済み

## Decisions

### 1. 本 change の apply は定義の文書化に限る

**選択肢**: (a) 定義の文書化のみ / (b) schema 実体と sync 実装まで本 change でやる。

(a) を採る。工程の間の中身の同期のさせ方・締めの実行の担い手は、いずれもポータルと feature を繋ぐ全体の設計に依存する（ユーザー確認 2026-08-26）。全体の設計が動いている段階で (b) をやると、決定を先取りして手戻る。上記の全体設計と決まった規約だけを文書に固定するのが本 change の役割である。

### 2. 定義文書の構成は specs の4 capability に章を対応させる

`docs/feature/overview.md` の章立てを「全体像（流れ図）/ 命名 / 器 / 工程 / 締め / 概念の対応 / 後続で決めること」とし、命名〜締めの4章を specs の4 capability と対応させる。読み合わせ（tasks 2.2）を機械的にできるようにするため。

### 3. 定義文書の置き場

`docs/feature/overview.md` に置く（ユーザー指定 2026-08-27）。feature の定義は `docs/feature/` 配下を置き場とする。

### 4. `__` 命名規則は ADR としても残す

`docs/adr/0013-feature-name-encodes-capability-path.md` を起こす。命名規則は一度 feature が作られ始めると覆すのが難しく（既存名の変換が要る）、ADR の「後から変えにくい決定」に当たる。入れ子禁止の実測根拠もここに束ねる。

## 締め（戻す接合）と孤児の扱いの設計

### 締めの接合

feature 固有の sync 工程は定義しない。締めは既存の2機能の接合である（ユーザー確認 2026-08-26）。

1. 本家の archive（spec-workflow が元々持つ機能）を起点にする
2. archive 時に requirements.md を `openspec/changes/<change-id>/` へ移す（戻す接合）
3. 以降は openspec 標準の sync → archive。sync は change 内の delta のパスをそのまま `openspec/specs/` へ反映する（spec 名から配置先を計算する機能は openspec に無い）

### 孤児の検出と修復

archive からの戻しは「修正の開始＝change を立てることと同義」であり、感知したら update change を新品で起こす（ユーザー決定 2026-08-27）。判定表・感知・表示・ガードの詳細は、成果物である `docs/feature/overview.md` の「本家操作との混在への対応」を正とする。

## Risks / Trade-offs

- [全体の設計が動いて定義文書と齟齬が出る] → 定義文書には決まった事だけを書き、未決を未決と明記する。齟齬が出うる面を未決側に寄せる
- [未決のまま依存 change が進んで解釈がぶれる] → 依存 change の proposal に完全準拠を明記済み。準拠先（定義文書）が未決と書いている事項は、依存 change 側でも決めずに実装時の設計へ送る

## Open Questions

いずれも全体の設計（実装時の設計）で決める。本 change の tasks（文書化）には影響しない。

- 中身の正の最終形（概念の対応に留めるか、形式まで縛るか）
- 工程の間の、change の成果物と本家の器の中身の同期のさせ方
- 締め（戻す接合と openspec 側の sync → archive）の実行の担い手
