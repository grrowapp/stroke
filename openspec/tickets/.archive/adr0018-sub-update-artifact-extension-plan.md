---
tags:
  - document
status: Open
order: 1.0
---

# adr0018-sub-update-artifact-extension-plan

拡張 artifact の検討資料（`docs/specs/plan/artifact-extension-plan.md`）を、未決定のまま置いてある状態から先へ進める。前提として挙げている本家の挙動が**すべてソース読解のみ**で実機確認されておらず、方式の採否も決まっていない。

`create-feature` から切り出した（[ADR-0018](../../docs/adr/0018-delegate-create-feature.md)）。区分は**前提**。

触るファイル:
- 更新 `docs/specs/plan/artifact-extension-plan.md`
- 更新 `docs/specs/reference/upstream-observations.md`（実機確認の結果の置き先）
- 参照 `docs/specs/architecture/spec-screen-flow.md`（現状の事実の側。資料と食い違ったらこちらが正）

## この change ですること

`docs/specs/plan/` は plan ファイルの置き場で、**発案はだいたいそこにある**。拡張 artifact の発案も `artifact-extension-plan.md` にある。

この change は、その plan を**実際の土台**として、**feature に適合する仕様を策定する**。発案のまま置いてある状態から、仕様の形へ起こすということである。

**順序がある。** `adr0018-sub-update-feature-workflow` による feature のワークフローの整理が先で、それを**ベース**に置いたうえで策定する。ワークフローの定義が動くと、適合すべき形も動くため。

**策定した仕様は `docs/specs/` へ置く**（ユーザー指示 2026-08-29）。change の delta（`openspec/changes/<change名>/specs/`）ではない。

未確定の点:

- 「feature に適合する」の適合先を、feature ワークフローの器の規定に取るか、機能的 spec の形式（Requirement + Scenario、delta 形式）に取るか、両方か
- plan ファイル自身を策定後にどう扱うか（残す / 畳む / 参照に置き換える）

## 起票時点で確認済みの事実

修正の出発点として、現状で分かっていることを記録しておく。これらが修正の全量という意味ではない。

### `create-feature` との接点

feature ワークフローの定義は、配置時に `proposal.md` を feature へ置くと定めている（`overview.md:84`。capability が複数なら分解された feature 全てに同じものを置き、集合定義の拠り所とする）。本家が spec として扱うのは requirements / design / tasks の3文書だけなので、**`proposal.md` は本家が知らない4本目の文書**になる。

これは資料が検討している「併存方式」——本家が知らないファイルを名前衝突なく同じディレクトリに置き、stroke-board 側に一層挟んで扱う——そのものである。その方式は未決定のまま資料に留まっている。

### 前提が実機確認されていない

資料が挙げている本家の挙動5点は、**すべて v2.2.7 のソースを読んだだけ**である（資料 `:23` が明記）。ADR-0006 は「本家は観測した挙動を基準にする」と定めているため、確定ではない。資料自身が未確認として3点を挙げている。

- `specs/<name>/` に未知の `.md` を置いた状態で `/specs/:name` と `/specs/:name/all` のレスポンスが変わらないこと
- そのファイルを保存したときに `spec-update` が流れ、payload に拡張分が入らないこと
- archive / unarchive で未知の `.md` が一緒に移動すること

**`create-feature` の proposal が同じ穴を独立に記録している。** 「本家が稼働中に外からファイルが増えたときの本家側の挙動（検出・一覧への反映）は未確認。design の前に実測が要る（ADR 0006 の流儀に従う）」——資料の未確認3点と、指しているものが同じである。

### 決めるべき問いが6件ある

資料が挙げているもの。上から順に下の答えを縛る。

1. 拡張 artifact を何で規定するか（`schema.yaml` 相当の6フィールドで足りるか）
2. その定義をどこに置くか（`.spec-workflow/` 内 / 外）
3. 新しい層をどのモジュールとして置くか（FS 読み取りをどちらの層に持たせるか）
4. `documents.get.ts` が返す形をどう変えるか（3キー固定を保ったまま足すか、形ごと変えるか）
5. 画面でどう並べるか（統合 / 別枠）— ADR-0005 に触れるため要判断
6. `spec-update` を再描画に使うかどうか（現状は捨てている）

このうち `create-feature` に直接効くのは 2・4・5 である。

## 関連

`adr0018-sub-update-feature-workflow` と独立ではない。定義側で `proposal.md` の配置をやめる決着になれば、この change の範囲は縮む。

方式を採ると決めた場合、それを扱う実体は `adr0018-sub-add-artifact-extension-system` が作る。
