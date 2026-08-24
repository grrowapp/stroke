# document-directory-structure — Design

## Context

`docs/specs/core/` に構造の資料が2本ある。`structure.md` はストローク側の規則（統合時に席を奪い合わないための名前空間規約）、`structure-design.md` はポータル側の層（接点・制御・画面の積み方と部品の配置）で、どちらも統合前の「自分の側」だけを書いている。リポジトリ全体のディレクトリ構造は steering の structure（`/opt/projects/stroke-board/.spec-workflow/steering/structure.md`、dashboard 管理）だけが持ち、しかもポータル単体時代のツリーのままである。

## Goals / Non-Goals

**Goals:**

- 2本のマージと微調整で最終の structure を1本作り、構造の定義を一元化する
- 統合後の実態から抽出したディレクトリ構造を docs 側（最終 structure）に持たせる
- steering の structure を最終 structure と連動させる

**Non-Goals:**

- 構造そのものの変更（ディレクトリの切り直し・移動はしない。書くのは今の実態）
- `file-component.md` / `file-components.md` / `file-composables.md` の取捨・統合
- 導線（答え合わせの規定）の定義

## Decisions

### 1. 最終ファイルは `docs/specs/core/system-structure.md`、`structure-design.md` は廃止

「最終の structure」は当初 `structure.md` の名前で残したが、承認時の指摘（steering → system-structure → 各詳細の参照連鎖）を受けて **`system-structure.md`** に改名した。`structure-design.md` はマージで吸収して削除する（`git rm`）。

**Alternatives considered:**
- 第3の新ファイルに両方を吸収: 参照の張り替えが2本ぶんに増え、名前も増えるため却下

### 2. マージの中身 — 統合された1つの Nuxt 4 アプリとして記述する

**（承認時の指摘で改訂）** 当初は「ディレクトリ構造＋ストローク側＋ポータル側」の3部並置としたが、「最終版はシステムが統合された状態。分離した dir をただ組み合わせただけの案は却下。nuxt4-patterns スキルを使え」の指摘を受け、**Nuxt 4 アプリの規約構造を主軸**に組み直した。

最終 structure の構成:

1. **全体像** — 2機能（ポータル / ストローク）が1つの Nuxt アプリに同居し、名前空間で区別される
2. **ディレクトリ構造** — 統合後の実態（ディレクトリのみ）
3. **画面 `app/`** — ページと URL・レイアウト・部品の配置（参照範囲と名前空間の2規則）・データ取得（`useFetch`/`useAsyncData` と `$fetch` の使い分け、nuxt4-patterns 準拠）
4. **サーバー `server/`** — 層（画面 / API / 制御・ストローク実装 / 接点 / 共有型）と各層の中身
5. **流れ** — 通知経路・下層読み取り経路・問いの往復（参照）
6. **統合の規則** — `stroke` 名前空間・URL の規則・領域に属さないもの（旧 `structure.md` の内容）
7. **規約・参照**

両ファイルの記述はこの構成に組み込み、事実は変えない。

### 3. `architecture-docs` spec の名指しを変更する

spec は「構造の資料は `structure-design.md` の1ファイル」と規定している。名指しを最終の `structure.md` に変え、**1ファイル規定は維持**する。マージはこの規定の狙い（構造の説明を1か所に）に沿う方向の変更である。

### 4. steering の連動 — Directory Organization を最終 structure と一致させる

steering の structure のうち、ポータル単体時代のままのディレクトリツリー（Directory Organization）を、最終 structure が持つ統合後のツリーと一致させる。ファイル配置の表からは `structure-design.md` の行が消える。アクセスは dashboard API（GET/PUT）経由でファイルを直接触らず、承認は dashboard で取る（`restructure-docs-specs` の Decision 5 と同じ）。

### 5. 参照の張り替えは現役のみ

`openspec/changes/archive/` に加え、完了済みの `openspec/changes/restructure-docs-specs/` も**記録として触らない**。張り替えるのは architecture-docs spec・CLAUDE.md 索引・`docs/specs/` 内の相互参照4本。

## Risks / Trade-offs

- **マージによる文脈の消失**: 2本はそれぞれ「自分の側」の前提で書かれている。機械的に連結すると主語が曖昧になるため、見出しでストローク側/ポータル側を明示して残す
- **spec の SHALL 名指し変更**: 規定の狙いは変えないが、spec の文言変更であることに変わりはない。proposal の Modified Capabilities に明示し、承認の場で判断を仰ぐ
- **steering 承認の往復**: 前 change で3往復した。今回は「ディレクトリ構造とファイル配置を分ける・表形式」の指摘を最初から織り込む
