# ADR-0018: create-feature から切り出した change の委譲理由

- **状態**: 起草中
- **日付**: 2026-08-29

## 決定

`create-feature` から切り出す change を、本 ADR に順次書き出す。委譲は2種に分ける。

- **前提**（`create-feature` の範囲がそれ無しには確定しない）
  - `adr0018-sub-update-feature-workflow`
  - `adr0018-sub-update-artifact-extension-plan`
- **後続**（`create-feature` の完了後に着手する）
  - `adr0018-sub-add-artifact-extension-system`

前提のいずれかが未了のうちは、`create-feature` は proposal の書き直しへ進まない。

> 本 ADR は書き出しの途中である。`create-feature` に残す範囲そのものは未確定で、確定は前提の完了を待つ。

## 背景

`create-feature` は proposal 1本だけを持ち、specs / design / tasks は未作成、status は `needs-info` である。実装は走っていない。したがって本 ADR の委譲先は、0016・0017 のように**親 change の作業中に現れたもの**ではなく、**2026-08-25 の triage が「この範囲では成立しない」と判定した論点**から来る。

triage が記録した未決は3点ある。

1. **空の feature を作る前提が誤り。** feature は中身を伴って生まれるもので、中身は「概要を入れる → ストロークが走る → proposal → それが requirements.md になる」流れから来る。proposal の「範囲は feature の作成までとし、内容の充填は後続 change で扱う」という切り分けは、作成の口だけ先に作ると作らないはずの空の feature を生むため成立しない
2. **構造は `connect-portal-and-strokes` の入口と同じで、階層だけが違う。** 新しい入口を作るのではなく、既にある入口を feature の階層へ再利用するものになる。この依存は proposal に書かれていない
3. **起点をどこに置くかが未決。** 「feature を作成する」ボタンが起点（点）か、change を単位にした継続管理を入れて「change を起こす」が起点（線）か。線を入れるなら `create-feature` の範囲は根本から変わる

加えて、`create-feature` の proposal は前提として「`define-feature-workflow`（feature ワークフローの仕様定義）の確定」を挙げ、specs / design を**その確定した仕様定義への完全準拠**で進めるとしている。準拠先が一意に定まっていることが、この change の出発点になっている。

## 委譲の内訳

各節の見出しは change 名。`状態` は ticket の status と tags、`成果物` は change ディレクトリの現況。

### 前提

`create-feature` の範囲がそれ無しには確定しないもの。

#### adr0018-sub-update-feature-workflow

- **状態**: needs-triage / document
- **成果物**: 未作成（change ディレクトリ無し。ticket のみ）
- **触るファイル**:
  - `docs/specs/plan/feature/overview.md`
  - `docs/specs/plan/feature/feature-workflow.md`
  - `openspec/specs/feature/`（`naming` / `structure` / `workflow/overview` / `workflow/sync` の4 capability）

**対応内容** — 先日 `docs/` に置いた feature のワークフロー定義に、**大きめの修正を入れる**（ユーザー指示 2026-08-29）。定義の中身そのものを見直す change であり、誤記の訂正や整形ではない。**修正の中身は未記録**で、ticket の `## 修正の中身` へ後から入る。

以下は起票時点で確認済みの事実であり、修正の全量ではない。

**問題** — feature ワークフローの定義が2つあり、両方が正を名乗ったまま食い違っている。`create-feature` が「完全準拠」の対象としている当の定義である。

2文書はいずれも冒頭で「本書は feature レーンの正である」と書き、命名の節でも「本書のこの節が命名の正である」と書いている。食い違いは4点。

| 論点 | `overview.md` | `feature-workflow.md` |
|---|---|---|
| 戻す接合の delta 変換 | 変換を**しない**（`:104`） | 変換を**含む**（`:67`） |
| change : capability | **1 : N**。正は proposal の Capabilities 節（`:73-74`） | feature の器 = change 相当。実質 **1 : 1**（`:103` `:116`） |
| 本家 unarchive 後の扱い | 「archive からの戻し」。`update-<feature名>` を自動起票（`:107-159`） | 「**孤児 / 逆孤児**」。検出して表示するのみ、修復はユーザー操作（`:70-97`） |
| ticket のファイル名 | **change 名**（`:75`） | **spec 名**の `__` 置換（例 `api__session.md`）（`:107`） |

**原因** — change `define-feature-workflow`（2026-08-27 承認・archive 済み）が `docs/feature/overview.md` を作り、CLAUDE.md の索引にも登録したが、**旧版を落とすタスクを持たなかった**。旧版は `6331b22`（未コミット分の取り込み）で入ったまま `docs/specs/architecture/` に残り、一度も更新されていない。索引にも ADR-0013 にも載っていないため、正でないことは索引を辿らないと分からなかった。

2026-08-29、両者を `docs/specs/plan/feature/` へ並べた（中身は一字も変えていない）。並べたことで比較はできるようになったが、正が2つある状態は変わっていない。

**対処** — 定義を1本に統合し、4点の食い違いに決着をつける。あわせて `overview.md` の「後続で決めること」4項の扱いを決める。

- 工程の間の、change の成果物と本家の器の中身の同期のさせ方
- 締め（戻す接合と openspec 側の sync → archive）の実行の担い手
- update change の起票の詳細（命名の確定・自演ガードの実装）
- 最初の回（確定した仕様がまだ無い作業中の feature）の change ↔ capability の対応の引き方

確定済みの capability spec 4本（`openspec/specs/feature/`）が既に `sync` で入っているため、定義を動かす場合はそちらへの delta が要る。

**完了判定** — 次をすべて満たしたとき完了とする。

- feature レーンの定義を名乗る文書が1本だけになっている
- 上の表の4点それぞれについて、どちらを採るか（または第3の答え）が決まり、根拠とともに記録されている
- `openspec/specs/feature/` の4 capability が、統合後の定義と食い違っていない
- `create-feature` が「完全準拠」の対象として参照できる先が一意に定まっている

**親との関係** — 前提。`create-feature` は proposal 段階で「確定した仕様定義への完全準拠」を宣言しており、準拠先が2つに割れている間は specs / design を書けない。特に「change : capability の多重度」と「ticket のファイル名」は、`create-feature` が feature を起こすときに何をいくつ作るかを直接決めるため、割れたままでは範囲を書けない。

#### adr0018-sub-update-artifact-extension-plan

- **状態**: needs-triage / document
- **成果物**: 未作成（change ディレクトリ無し。ticket のみ）
- **触るファイル**:
  - `docs/specs/plan/artifact-extension-plan.md`
  - `docs/specs/`（策定した仕様の置き先）
  - `docs/specs/architecture/spec-screen-flow.md`（現状の事実の側。資料と食い違ったらこちらが正）
  - `docs/specs/reference/upstream-observations.md`（実機確認の結果の置き先）

**対応内容** — `docs/specs/plan/` は plan ファイルの置き場で、**発案はだいたいそこにある**（ユーザー指示 2026-08-29）。拡張 artifact の発案も `artifact-extension-plan.md` にある。この change は、その plan を**実際の土台**として、**feature に適合する仕様を策定する**。発案のまま置いてある状態から、仕様の形へ起こすということである。

**策定した仕様は `docs/specs/` へ置く**（ユーザー指示 2026-08-29）。change の delta（`openspec/changes/<change名>/specs/`）ではない。

**順序がある。** `adr0018-sub-update-feature-workflow` による feature のワークフローの整理が先で、それを**ベース**に置いたうえで策定する。ワークフローの定義が動くと、適合すべき形も動くため。

以下は起票時点で確認済みの事実であり、対応の全量ではない。

**問題** — `create-feature` が feature を起こすときに置く `proposal.md` は、**本家が知らない `.md` を `specs/<name>/` へ併存させるもの**である。これは `artifact-extension-plan.md` が検討している併存方式そのものだが、その方式は**未決定**のまま資料に留まっている。

feature ワークフローの定義は、配置時に `proposal.md` を feature へ置くと定めている（`overview.md:84`。capability が複数なら分解された feature 全てに同じものを置き、集合定義の拠り所とする）。本家が spec として扱うのは requirements / design / tasks の3文書だけなので、`proposal.md` は4本目の——本家から見えない——文書になる。

**原因** — 資料が前提として挙げている本家の挙動5点は、**すべて v2.2.7 のソースを読んだだけ**で、実機での確認をしていない（資料 `:23` が明記）。ADR-0006 は「本家は観測した挙動を基準にする」と定めているため、この5点は確定ではない。資料自身が未確認として3点を挙げている。

- `specs/<name>/` に未知の `.md` を置いた状態で `/specs/:name` と `/specs/:name/all` のレスポンスが変わらないこと
- そのファイルを保存したときに `spec-update` が流れ、payload に拡張分が入らないこと
- archive / unarchive で未知の `.md` が一緒に移動すること

`create-feature` の proposal も同じ穴を独立に記録している。「本家が稼働中に外からファイルが増えたときの本家側の挙動（検出・一覧への反映）は未確認。design の前に実測が要る（ADR 0006 の流儀に従う）」——資料の未確認3点と、指しているものが同じである。

**策定にあたって片づくもの** — 未確認3点を実機で確認し、結果を観測の記録へ落とす。資料が「決めるべき問い」として挙げた6点は、上から順に下の答えを縛る形になっている。`create-feature` に直接効くのは次である。

- **定義の置き場所**（`.spec-workflow/` 内 / 外）— feature を起こすときに何をどこへ作るかが決まる
- **画面での並べ方**（本家の3本と拡張分を統合するか別枠にするか）— ADR-0005 に触れるためユーザーの判断が要る
- **`documents.get.ts` が返す形**（3キー固定の `SpecDocumentsDto` を保ったまま足すか、形ごと変えるか）— 変えると `[specName]/index.vue` と `[document].vue` の両方へ波及する

**完了判定** — 次をすべて満たしたとき完了とする。

- plan を土台にした仕様が `docs/specs/` に置かれ、feature に適合している
- 未確認3点が実機で確認され、結果が観測の記録に残っている（ソース読解のままの前提が無い）
- 併存方式を採るか採らないかが決まっている
- 採る場合、定義の置き場所・画面での並べ方・`documents.get.ts` の返す形が決まっている
- `create-feature` が `proposal.md` を置いてよいかどうかが、根拠とともに言える状態になっている

**親との関係** — 前提。`create-feature` は本家領域への書き込みを行う change であり、置くものの中に本家が知らない文書が含まれる。それが安全かどうかがソース読解止まりのままでは、design へ進めない。`create-feature` の proposal 自身が「design の前に実測が要る」と書いており、その実測がこの change に当たる。

なお、この change は `adr0018-sub-update-feature-workflow` と独立ではない。feature ワークフローの定義が `proposal.md` の配置を規定しているため、定義側で配置をやめる決着になれば、この change の範囲は縮む。

### 後続

`create-feature` の完了後に着手するもの。

#### adr0018-sub-add-artifact-extension-system

- **状態**: needs-triage / enhancement
- **成果物**: 未作成（change ディレクトリ無し。ticket のみ）
- **触るファイル**:
  - `server/api/projects/[projectId]/specs/[specName]/documents.get.ts` — 返す形
  - `shared/types.ts:156` — `SpecDocumentsDto`。現状は `Record<'requirements' | 'design' | 'tasks', …>` の**3キー固定**
  - `app/pages/projects/[projectId]/specs/[specName]/index.vue` / `[document].vue` — 契約変更の波及先
  - `server/utils/` の制御層 — 新しい層の置き場。接点層（`server/utils/upstream/`）には置けない
  - `test/server/utils/upstream/read-only.test.ts` — 本家領域への書き込み禁止の担保

**対応内容** — **plan で設計に落とした内容を実装する**（ユーザー指示 2026-08-29）。`adr0018-sub-update-artifact-extension-plan` が、`docs/specs/plan/` にある発案（plan）を土台に、feature に適合する仕様を `docs/specs/` へ策定する。この change は、そこで設計に落ちた内容をコードにする側である。

**この change が自分で方式を決めることはない。** 何を作るかは策定の結果で決まる。以下は起票時点で確認済みの事実であり、対応の全量ではない。

**問題** — `adr0018-sub-update-artifact-extension-plan` で併存方式を採ると決めても、それを扱う実体が無い。`create-feature` が置いた `proposal.md` は、置きっぱなしで画面から読み戻せない。

本家の API に拡張分の本文を返す口は無い（`/specs/:name/all` は3キー固定で、汎用のファイル読み出しエンドポイントも無い）。したがって拡張 artifact の本文だけは**ファイルシステムを直接読む**しかない。

**原因** — 現状の契約が本家の3文書に合わせて固まっている。`SpecDocumentsDto` が3キー固定で、画面2枚がその形に依存している。本家が知らない文書を1本増やすだけで、サーバの返す形と画面の両方に波及する。

**策定の結果として見えている形** — 拡張 artifact を扱う層を制御層に1つ挟む形になる見込み。本家に触る部分は変えない。確定は策定側による。

- 拡張 artifact の定義を持つ（`schema.yaml` 相当の6フィールド——`id` / `generates` / `description` / `template` / `instruction` / `requires`——で足りるかは前提側で決まる）
- 本家 API 経由の3文書と、FS 直読みの拡張分を、1つの層で束ねる。`UpstreamRestClient.getSpecDocuments()` の呼び出しも本家の `/all` も現状のまま、新しい層が既存の呼び出しを包む
- `documents.get.ts` の返す形を、前提側で決めた形へ変える
- 画面2枚を新しい形に追従させる

**層の置き場所に制約がある。** 接点層（`server/utils/upstream/`）は本家の形をそのまま扱う場所であり、本家が知らない概念を持ち込めない（構造の規範の層の定義）。したがって新しい層は制御層になる。ただし FS 直読みをどちらの層に持たせるかは別途判断が要る。

**書き込み禁止には触れない。** `read-only.test.ts` が禁じているのは `writeFile` / `mkdir` / `rm` などの書き込みと本家の書き込み API であって、読み取りは対象外である。FS 直読みには `server/utils/upstream/scan.ts` と `registry.ts` に前例がある。

**完了判定** — 次をすべて満たしたとき完了とする。

- 拡張 artifact の本文が画面から読める
- 本家 API の呼び出しが1行も変わっていない
- 拡張 artifact を増やしても、本家の3文書の扱いが壊れない
- `read-only.test.ts` が通り続けている（本家領域への書き込みが増えていない）

**親との関係** — 後続。ただし**位置づけに判断が要る**。`create-feature` は feature を起こして `proposal.md` を置くところまでで、置いた文書を読み戻す口はこの change が作る。`create-feature` の完了条件に「置いた `proposal.md` が画面から読めること」を含めるなら、この change は後続ではなく**前提**になる。含めないなら、`create-feature` の完了時点では `proposal.md` は書きっぱなしの状態で残る。

前提となる `adr0018-sub-update-artifact-extension-plan` で併存方式を採らない決着になった場合、この change は消える。

## 根拠

- 委譲先は 0016・0017 と違い、親の作業から出たものではない。`create-feature` は着手前であり、切り出しの材料は triage の判定だけである。したがって本 ADR は「作業して分かったこと」ではなく「着手前に分かっている、着手を妨げているもの」を記録する
- 定義の統合を `create-feature` の delta に混ぜない。混ぜると、feature を作る口の設計と、feature ワークフローそのものの定義変更が同じ change の中で動き、どちらの判断でどう決まったのかが記録から読めなくなる

## 影響

- `create-feature` は `needs-info` のまま据え置く。前提の完了を待つ
- 本 ADR は書き出しの途中である。委譲先が確定するまで状態は「起草中」とし、確定した時点で「採用」に改める
