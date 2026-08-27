# feature のワークフロー定義

feature（実装のタスクに繋がる文書の組）の定義。stroke-board は文書を **feature** と**仕様書**（システムをドキュメントとして記述し続けるもの）の2レーンで扱い、本書は feature レーンの正である。

確定の経緯は change `define-feature-workflow`（proposal・specs 4本・design を spec-workflow 上で承認済み、2026-08-26）。仕様書レーンは仮決めのみで、器は change `define-spec-document-workflow` にある。

## 全体像

```
change の起票                              ← 入口は複数ある（[入口](#入口)）
  │ 起票で生まれるもの:
  │   openspec/changes/<change名>/   ← change（必ず作られる。確定事項）
  │   openspec/tickets/<change名>.md ← ticket（change と1対1。起票の概要のみ・以後追記しない）
  ▼
stroke でエージェントが schema の instruction に従い proposal.md を書く
  │ proposal の Capabilities 節で capability が確定する
  │ （Capabilities 節が change ↔ capability の対応の正になる）
  ▼
エージェントが schema の instruction に従い、Capabilities 節の capability ごとに spec.md を書く
  │ openspec/changes/<change名>/specs/<階層パス>/spec.md（capability ごとに1つ）
  ▼
stroke-board が spec.md を feature として .spec-workflow に配置する
  │ feature の名前は capability のパスを `__` 規約でエンコード
  ▼
.spec-workflow/specs/<spec名>/            ← 器（capability と1対1）
  ├ proposal.md       （change の proposal に対応。本家は読まないが有っても害なし）
  ├ requirements.md   （change の spec に対応）
  ├ design.md         （change の design に対応）
  └ tasks.md          （change の tasks に対応）
  │ エージェントが内容の充填 〜 実装を進める（工程は schema の外部定義で決まる）
  │ tasks 全完了 ＝ その feature（capability）の作業完了
  ▼
本家の archive（spec-workflow が元々持つ機能）
  │ requirements.md の中身を change 内の spec.md（delta）へ戻す（戻す接合。実行の担い手は未決）
  │ → openspec/changes/<change名>/specs/<階層パス>/spec.md
  ▼
openspec 標準の sync → archive
  │ 対象 capability すべての戻す接合が揃ってから実行する（実行の担い手は未決）。
  │ sync が delta を同じパスへ反映し、archive が change を片づける
  ▼
openspec/specs/<階層パス>/spec.md          ← 確定した仕様の置き場
  │
  │ 本家で archive から戻された（unarchive）
  │ ＝ その capability にフォーカスした修正の開始
  ▼
stroke-board が update-<feature名> の change を新品で起こす
  │ 対象の capability は、復元された器の spec 名に置換ルールを適用して特定する（1つ）。
  │ 器は本家が丸ごと復元する。
  │ 締めの戻す接合では、全文と確定済み spec の差分から MODIFIED の delta を作る
  └─▶（「内容の充填 〜 実装」へ戻る）
```

## 入口

stroke が始まる口は複数ある。代表は2つで、網羅と挙動の定義は操作の口を実装する依存 change 側が持つ。

- change を起票して（ticket + 定義だけの状態から）、change から stroke を開始する
- feature の画面から stroke を開始する

## 命名

**本書のこの節が命名の正である**（[ADR-0013](../adr/0013-feature-name-encodes-capability-path.md) は決定の経緯の記録）。命名は1つの**置換ルール**として定義する。

- 階層パス（`/` 区切り）とフラット名は、`/` ↔ `__`（2重アンダーバー）の置換で相互変換する
  - `api/session` ↔ `api__session`
  - 階層を持たない名前はそのまま: `portal` ↔ `portal`
- セグメントはアンダースコアを含まない kebab-case（英小文字・数字・ハイフン）。これにより `__` は常に区切りとしてのみ現れ、変換は可逆になる
- パスとフラット名は1対1に対応する。同名は存在しない

フラット名が要る場所では、すべてこの置換ルールを適用する。

## 対応の定義

登場物どうしの対応は次の通り。

| これ | それ | 多重度 | 対応の根拠 |
|---|---|---|---|
| feature | capability（openspec の spec） | **1 : 1**（永続） | 名前。spec 名 ↔ パスの置換ルール |
| change | capability（= feature） | **1 : N** | change の proposal が capability を確定し、エージェントが proposal を元に書いた spec.md（capability ごとに1つ）を stroke-board が feature として spec-workflow に配置する。対応の正は proposal の Capabilities 節 |
| ticket | change | **1 : 1** | ファイル名 = change 名（`openspec/tickets/<change名>.md`）。起票時に作られ、起票の概要のみを持ち、以後追記しない |
| 器の1周回（作成 〜 archive） | change 1つ | 1 : 1 | archive から戻す＝同じ器・別の change（update change） |

- 「この capability を対象とする進行中の change はどれか」は **change の proposal の Capabilities 節から引く**
- 対応は **proposal で capability が確定した時点で成立する**。それまでは対応が無い状態でよい。update change は起票の瞬間から対象が1つ確定している（復元された器の spec 名に置換ルールを適用して特定する）

## 器

- feature は `.spec-workflow/specs/<spec名>/` 直下の proposal.md / requirements.md / design.md / tasks.md で構成される
- 本家が spec として扱うのは requirements / design / tasks の3文書のみ。proposal.md は本家からは見えないが、置いてあっても害はない。stroke-board では feature の文書の種類として追加する予定
- `.spec-workflow/specs/` 配下に入れ子ディレクトリを持たない。入れ子は本家の一覧に現れず、本家のファイル監視が親 spec に存在しない文書の更新イベントを飛ばす（実測 2026-08-26、[upstream-observations](../specs/reference/upstream-observations.md)）。階層は入れ子ではなく `__` エンコードのフラット名で表す

## 工程

- 工程は openspec のローカル schema による外部定義で決まり、アプリのコード変更・再ビルドなしに反映される
- 工程を進めるのは**エージェント**である。schema は artifact ごとに instruction を持ち、エージェントはそれに従って文書を書く（openspec 自体は文書を作らない）
- tasks の完了の後、締め（次節）で工程が終わる
- schema の中身の詳細（artifact 定義・template）は本書では定めない。実装時の設計とする

## 締め（本家 archive → openspec 標準ライフサイクル）

feature 固有の sync 工程は**定義しない**。締めは既存の2つの機能の接合である。

- 起点は**本家の archive**（spec-workflow が元々持つ機能）
- **戻す接合**: archive のとき、requirements.md の中身を対応する change 内の **delta** `openspec/changes/<change名>/specs/<階層パス>/spec.md` へ戻す（proposal の後に作られた spec.md を更新する）。階層パスは spec 名に置換ルールを適用して得る（`api__session` → `specs/api/session/spec.md`）
- **sync**: openspec 標準の sync が change 内の delta を**同じパス**の `openspec/specs/<階層パス>/spec.md` へ反映する。spec 名から配置先を計算する機能は openspec に無く、配置先は delta のパスだけで決まる
- **archive**: openspec 標準の archive が change を片づけ、工程が終わる（openspec の `archive` コマンドは sync と片づけの両方を行う）
- change の対象 capability が複数のときは、**すべての対象の戻す接合が揃ってから** sync → archive を実行する（change は1つなので、締めも1回）
- 戻す接合は **delta 形式への変換を含む**。置かれる delta は openspec の delta 形式（`## ADDED Requirements` 等 + Requirement / Scenario）であり、sync がそのまま読める状態にする
- 修正の回（次節の update change）では、器の requirements.md は**全文**で編集される（本家に delta の概念が無い）。戻す接合はこの全文と確定済みの `openspec/specs/<階層パス>/spec.md` の差分から **MODIFIED の delta** を作ることになる。この差分の作り方は[後続で決めること](#後続で決めること)
- 結果として `openspec/specs/` に入る spec.md は openspec の機能的 spec の形式（Requirement + Scenario）に適合する

### 本家操作との混在への対応（archive からの戻し）

本家のダッシュボードには archive を取り消す操作（unarchive）があり、stroke-board からは止められない。unarchive は `fs.rename` で spec のディレクトリを `.spec-workflow/specs/` へ**丸ごと戻す**ため、器（requirements.md 等）は archive 時点のまま復元される（v2.2.7 ソース確認: `archive-service.ts`）。

概念として、spec の変更は change を立てて delta を作るのが正しい流れである。本家には delta の概念が無いので、**archive から戻す＝修正・やり直しの開始＝change を立てることと同義**である。feature は1つ（本家側に changes / specs のような状態区分は無く、同じ器がそのまま作業場になる）。

そこで stroke-board は、archive からの戻しを感知したら**内容変更の change（`update-<feature名>` のような名前）を新品で起こす**。

**spec-update からの流れ**:

```
本家で unarchive（archive から戻す）
  ▼
stroke-board が感知する
  │ WS spec-update の受信、または画面ロード時の突き合わせ（ADR-0012 の流儀）
  ▼
stroke-board が update-<feature名> の change を新品で起こす（ticket も同時に作る）
  │ 対象の capability は、復元された器の spec 名に置換ルールを適用して特定する
  ▼
（全体像の stroke → proposal 以降に合流）
```

- 起こす change は完全な新品。過去の change や確定済み spec からの引き写しはしない（器の復元は本家が全部やる）
- 確定済みの `openspec/specs/<階層パス>/spec.md` は正のまま残る
- 自演ガード: stroke-board 自身が締めを実行している間の `spec-update` では起票しない

**突き合わせ**（ロード時・受信時に全量をやり直す）: feature ごとに、次の3箇所を見比べる。

1. 本家に器があるか — `.spec-workflow/specs/` にアクティブな spec があるか
2. 作業中の change があるか — **proposal の Capabilities 節**にそのパスを含む change が、`openspec/changes/`（`archive/` 除く）に居るか（[対応の定義](#対応の定義)。delta の存在では引かない）
3. 確定した仕様があるか — `openspec/specs/<パス>/spec.md` があるか

例: feature `api__session` なら、パスは `api/session`。見るのは `.spec-workflow/specs/api__session/` の有無、`api/session` を Capabilities に持つ進行中 change の有無（`openspec/changes/` の proposal を見る）、`openspec/specs/api/session/spec.md` の有無の3点である。

この判定は毎回その場の状態だけで完結する。過去のスナップショットの保存や差分の追跡は持たない（サーバ再起動に強く、ロード時・受信時で同じ判定になる）。

| 本家の器 | 作業中の change | 確定した仕様 | 状態と対応 |
|---|---|---|---|
| ある | ある | どちらでも | 進行中。正常 |
| ある | ない | ある | archive からの戻し → **update change を起こす** |
| ある | ない | ない | 出自不明 → 表示してユーザー判断 |
| ない | ある | どちらでも | 本家の器が消えた → 表示してユーザー判断 |

**表示**: 自動で回復できないもの（出自不明・器の消失）は Feature 一覧の該当行にバッジを付け、詳細で上の表のどれに当たるかを示す。

## changes との関係

openspec では作業は change（`openspec/changes/<id>/`）として追跡される。change は proposal・specs（delta）・design・tasks を持ち、完了すると **sync**（delta を main specs へ反映）で `openspec/specs/` に確定した仕様が入り、その後 **archive** で change が片づけられる（openspec の `archive` コマンドは specs の更新と change の片づけの両方を行う）。順序は sync → archive である。

進行中の feature には、**それを対象とする進行中の change が必ず `openspec/changes/` に存在する**（確定事項）。change と feature は 1 : N であり、対応は proposal の Capabilities 節で引く（[対応の定義](#対応の定義)）。

- feature の proposal / requirements / design / tasks は、change の成果物（proposal / spec / design / tasks）に対応する
- feature の tasks 全完了の後、本家の archive を起点に requirements.md が change 内の delta（`specs/<階層パス>/spec.md`）へ戻る（戻す接合）。change の対象すべての戻す接合が揃ったら、openspec 標準の sync → archive で締まる
- change の中に作られる `.openspec.yaml` には概要の情報が入らない。そこで `openspec/tickets/` に独自の **ticket**（md）を置く。ticket は change と1対1（`openspec/tickets/<change名>.md`）で、起票時に作られ、一番初めに change が何を意図したかの簡単な概要のみを持つ。後から情報を書き足す運用（メモ）はしない
- change の成果物と本家の器の中身を**どう同期させるか**は未決（[後続で決めること](#後続で決めること)）。どちらに転んでも、確定した仕様の置き場が `openspec/specs/` であることは変わらない

## 概念の対応

本家の枠組みを器として使い、概念の整理は openspec 側に合わせる。

| 本家の器 | openspec の概念 | 備考 |
|---|---|---|
| `.spec-workflow/specs/<spec名>/` | capability の器 | 進行中の回は、その capability を対象とする change に対応。中身の同期のさせ方は未決 |
| `proposal.md` | change の proposal | 本家は読まない。stroke-board が feature の文書の種類として扱う予定 |
| `requirements.md` | spec（Requirement + Scenario） | 概念がほぼ同じ。「openspec の spec が名前を変えたもの」が最も近いイメージ。requirements 側はスコープが粗め。形式まで縛るかは未決 |
| `design.md` | change の design | |
| `tasks.md` | change の tasks | |
| tasks 全完了 → 本家の archive | sync → archive | 本家 archive で requirements が change へ戻り、sync で `openspec/specs/` が育ち、archive で change が片づく |
| archive からの戻し | 修正の change を立てる | `update-<feature名>` を新品で起こす |

## 後続で決めること

いずれも全体の設計（実装時の設計・後続の change）で決める。決まるまで、依存 change 側でも決めずに実装時の設計へ送る。

- **delta の起こし方（差分観点）**: 修正の回で、器の全文と確定済み spec の差分から MODIFIED の delta を作る仕組み。現時点のイメージは「stroke-board の feature 画面上に stroke を起こす機能を実装し、その工程が動いて delta を起こす」（仮）
- 中身の正の最終形（概念の対応に留めるか、形式まで縛るか）
- 工程の間の、change の成果物と本家の器の中身の同期のさせ方
- 締め（戻す接合と openspec 側の sync → archive）の実行の担い手
- update change の起票の詳細（命名の確定・自演ガードの実装）

feature への操作（作成・削除等）の挙動は本書では定めない。操作の口を実装する依存 change（`create-feature` ほか）側の仕様が定める。
