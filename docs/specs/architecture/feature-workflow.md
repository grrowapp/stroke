# feature のワークフロー定義

feature（実装のタスクに繋がる文書の組）の定義。stroke-board は文書を **feature** と**仕様書**（システムをドキュメントとして記述し続けるもの）の2レーンで扱う。

> **本書は正ではない。** feature レーンの正は [`docs/feature/overview.md`](../../feature/overview.md) であり、本書と食い違ったらあちらが勝つ。本書は承認前の草稿が残ったもので、構造の記述として参照する。

確定の経緯は change `define-feature-workflow`（proposal・specs 4本・design を spec-workflow 上で承認済み、2026-08-26）。仕様書レーンは仮決めのみで、器は change `define-spec-document-workflow` にある。

## 全体像

```
ポータル（作成の口は create-feature が実装）
  │ 作成。名前は `__` 規約でエンコード
  ▼
openspec/changes/<change-id>/             ← change。必ず作られる（確定事項）。
openspec/tickets/<change名>.md            ← ticket。change が何を意図したものかの
  │                                          簡単な概要。ファイル名は change 名
  │                                          そのまま（`__` 置換は適用しない）
  ▼
.spec-workflow/specs/<spec名>/            ← 器
  ├ proposal.md       （change の proposal に対応。本家は読まないが有っても害なし）
  ├ requirements.md   （change の spec に対応）
  ├ design.md         （change の design に対応）
  └ tasks.md          （change の tasks に対応）
  │ 内容の充填 〜 実装。工程は schema の外部定義で決まる
  │ tasks 全完了 ＝ change の完了
  ▼
本家の archive（spec-workflow が元々持つ機能）
  │ requirements.md の中身を change 内の delta として置く（戻す接合）
  │ → openspec/changes/<change-id>/specs/<階層パス>/spec.md
  ▼
openspec 標準の sync → archive
  │ sync が delta を同じパスへ反映し、archive が change を片づける
  ▼
openspec/specs/<階層パス>/spec.md          ← 確定した仕様の置き場
```

## 命名

**本書のこの節が命名の正である**（[ADR-0013](../../adr/0013-feature-name-encodes-capability-path.md) は決定の経緯の記録）。命名は1つの**置換ルール**として定義する。

- 階層パス（`/` 区切り）とフラット名は、`/` ↔ `__`（2重アンダーバー）の置換で相互変換する
  - `api/session` ↔ `api__session`
  - 階層を持たない名前はそのまま: `portal` ↔ `portal`
- セグメントはアンダースコアを含まない kebab-case（英小文字・数字・ハイフン）。これにより `__` は常に区切りとしてのみ現れ、変換は可逆になる
- パスとフラット名は1対1に対応する。同名は存在しない

フラット名が要る場所では、すべてこの置換ルールを適用する。

## 器

- feature は `.spec-workflow/specs/<spec名>/` 直下の proposal.md / requirements.md / design.md / tasks.md で構成される
- 本家が spec として扱うのは requirements / design / tasks の3文書のみ。proposal.md は本家からは見えないが、置いてあっても害はない。stroke-board では feature の文書の種類として追加する予定
- `.spec-workflow/specs/` 配下に入れ子ディレクトリを持たない。入れ子は本家の一覧に現れず、本家のファイル監視が親 spec に存在しない文書の更新イベントを飛ばす（実測 2026-08-26、[upstream-observations](../reference/upstream-observations.md)）。階層は入れ子ではなく `__` エンコードのフラット名で表す

## 工程

- 工程は openspec のローカル schema による外部定義で決まり、アプリのコード変更・再ビルドなしに反映される
- tasks の完了の後、締め（次節）で工程が終わる
- schema の中身の詳細（artifact 定義・template）は本書では定めない。実装時の設計とする

## 締め（本家 archive → openspec 標準ライフサイクル）

feature 固有の sync 工程は**定義しない**。締めは既存の2つの機能の接合である。

- 起点は**本家の archive**（spec-workflow が元々持つ機能）
- **戻す接合**: archive のとき、requirements.md の中身を対応する change 内の **delta** `openspec/changes/<change-id>/specs/<階層パス>/spec.md` として置く。階層パスは spec 名に置換ルールを適用して得る（`api__session` → `specs/api/session/spec.md`）
- **sync**: openspec 標準の sync が change 内の delta を**同じパス**の `openspec/specs/<階層パス>/spec.md` へ反映する。spec 名から配置先を計算する機能は openspec に無く、配置先は delta のパスだけで決まる
- **archive**: openspec 標準の archive が change を片づけ、工程が終わる（openspec の `archive` コマンドは sync と片づけの両方を行う）
- 戻す接合は **delta 形式への変換を含む**。置かれる delta は openspec の delta 形式（`## ADDED Requirements` 等 + Requirement / Scenario）であり、sync がそのまま読める状態にする
- 結果として `openspec/specs/` に入る spec.md は openspec の機能的 spec の形式（Requirement + Scenario）に適合する

### 本家操作との混在（孤児）の検出

本家のダッシュボードには archive を取り消す操作（unarchive）があり、stroke-board からは止められない。締めが終わった feature が本家で unarchive されると、本家では「アクティブな feature」に見えるのに、openspec 側の change は既に片づいている。この置き去りを**孤児**と呼ぶ。

stroke-board は孤児を**検出して表示する**。修復は自動で行わず、ユーザー操作に委ねる（ADR-0005 の流儀）。

**検出のやり方**: feature ごとに、次の3箇所を見比べる。

1. 本家に器があるか — `.spec-workflow/specs/` にアクティブな spec があるか
2. 作業中の change があるか — `openspec/changes/` のいずれかが、その feature のパスの delta（`specs/<パス>/`）を持っているか
3. 確定した仕様があるか — `openspec/specs/<パス>/spec.md` があるか

例: feature `api__session` なら、パスは `api/session`。見る場所は `.spec-workflow/specs/api__session/`・`openspec/changes/*/specs/api/session/`・`openspec/specs/api/session/spec.md` の3箇所である。

組み合わせの意味:

| 本家の器 | 作業中の change | 確定した仕様 | 状態 |
|---|---|---|---|
| ある | ある | どちらでも | 進行中。正常 |
| ある | ない | ある | **孤児**。締めまで終わった feature が本家で unarchive された |
| ある | ない | ない | **孤児**。openspec 側に出自が無い |
| ない | ある | どちらでも | **逆孤児**。openspec は作業中なのに本家の器が消えた |

**いつ見比べるか**: 画面ロード時（ADR-0012 の流儀）と、本家からの WS `spec-update` 受信時。**unarchive でも `spec-update` は飛ぶ**——本家の unarchive は `fs.rename` で spec のディレクトリを `.spec-workflow/specs/` に戻すだけであり、それを SpecWatcher（`specs/**/*.md` 監視）が検出して発行する（v2.2.7 ソース確認: `archive-service.ts` / `watcher.ts`。遅延は既知の最大 ~2.8 秒）。受信内容は全件スナップショットなので、毎回まるごと見比べ直せばよい（差分の追跡は不要）。見比べはサーバ側で行う。

**どう見せるか**: Feature 一覧の該当行にバッジを付け、詳細で上の表のどれに当たるかを示す。

**修復**: ユーザーの操作として (a) 本家で再 archive する、(b) openspec 側に change を作り直して作業を再開する。stroke-board 側に archive の口を作る場合は、締めの一連（本家 archive → 戻す接合 → sync → archive）をまとめて実行し、途中で失敗したらそこで止まったことを表示する。unarchive の口は openspec 側の状態を確認してから通す。

## changes との関係

openspec では作業は change（`openspec/changes/<id>/`）として追跡される。change は proposal・specs（delta）・design・tasks を持ち、完了すると **sync**（delta を main specs へ反映）で `openspec/specs/` に確定した仕様が入り、その後 **archive** で change が片づけられる（openspec の `archive` コマンドは specs の更新と change の片づけの両方を行う）。順序は sync → archive である。

feature には**必ず対応する change が `openspec/changes/` に存在する**（確定事項）。

- feature の proposal / requirements / design / tasks は、change の成果物（proposal / spec / design / tasks）に対応する
- feature の tasks 全完了の後、本家の archive を起点に requirements.md が change 内の delta（`specs/<階層パス>/spec.md`）へ戻り（戻す接合）、openspec 標準の sync → archive で締まる
- change の中に作られる `.openspec.yaml` には概要の情報が入らない。そこで `openspec/tickets/` に独自の **ticket**（md）を置き、一番初めに change が何を意図したものかの簡単な概要を記す。ファイル名は change 名をそのまま使い `.md` を付ける（例: change `create-feature` → `openspec/tickets/create-feature.md`）。`__` 置換ルールは feature 名（spec 名）専用であり、ticket 名には適用しない
- change の成果物と本家の器の中身を**どう同期させるか**は未決（[未決事項](#未決事項)）。どちらに転んでも、確定した仕様の置き場が `openspec/specs/` であることは変わらない

## 概念の対応

本家の枠組みを器として使い、概念の整理は openspec 側に合わせる。

| 本家の器 | openspec の概念 | 備考 |
|---|---|---|
| `.spec-workflow/specs/<spec名>/` | change（`openspec/changes/` に必ず存在）の器 | 中身の同期のさせ方は未決 |
| `proposal.md` | change の proposal | 本家は読まない。stroke-board が feature の文書の種類として扱う予定 |
| `requirements.md` | spec（Requirement + Scenario） | 概念がほぼ同じ。「openspec の spec が名前を変えたもの」が最も近いイメージ。requirements 側はスコープが粗め。形式まで縛るかは未決 |
| `design.md` | change の design | |
| `tasks.md` | change の tasks | |
| tasks 全完了 → 本家の archive | sync → archive | 本家 archive で requirements が change へ戻り、sync で `openspec/specs/` が育ち、archive で change が片づく |

## 未決事項

いずれも全体の設計（実装時の設計）で決める。決まるまで、依存 change 側でも決めずに実装時の設計へ送る。

- 中身の正の最終形（概念の対応に留めるか、形式まで縛るか）
- 工程の間の、change の成果物と本家の器の中身の同期のさせ方
- 締め（戻す接合と openspec 側の sync → archive）の実行の担い手

feature への操作（作成・削除等）の挙動は本書では定めない。操作の口を実装する依存 change（`create-feature` ほか）側の仕様が定める。
