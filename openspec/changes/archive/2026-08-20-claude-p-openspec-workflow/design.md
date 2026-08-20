# claude-p-openspec-workflow — Design

## Context

動機は proposal.md - Why を参照。前提となる現状:

- 指示本文は `server/utils/prompt.ts` の固定テンプレート1本。質問を続けるか proposal を起こすかの進行判断は、指示を読んだ AI 自身が行う構造（進行制御をシステム側に持たない）
- 進行中 change `migrate-claude-p-to-api-endpoint` が受け渡しを agent-api（入力 GET / 提出 POST）へ移行中。リトライ・タイムアウト・起動方式（ADR 0001: `--setting-sources project`・`--add-dir`・prompt は `--` の後ろの位置引数1本）は同 change と ADR の管轄で、本 change は変えない
- `grilling` / `domain-modeling` のスキル実体は `--add-dir` が指すリポジトリの `.claude/skills/` にある（ADR 0001）
- openspec は npm グローバルの `@fission-ai/openspec` 1.9.0。store 機構（`openspec store register` / `--store <id>`）により cwd に依存せず OpenSpec ルートを指定できる（`store list` で動作確認済み）

## Goals / Non-Goals

**Goals:**

- 指示本文の置き場所を `prompt.ts` から openspec のワークフロー定義（schema.yaml / config.yaml / template 群）へ移す
- prompt をコマンド実行指示＋動的値の添え書きの定型に縮小する
- 定義ファイルの編集だけで、コード変更・再ビルド・再起動なしに次回呼び出しから反映される構造にする（specs/workflow-definition）

**Non-Goals:**

- 進行制御の新設はしない。どの段にいるか・次へ進むかは claude 自身が判断する（現行と同じ）。サーバは段を意識せず、openspec の done 判定にも進行を委ねない
- agent-api の契約・リトライ規定・起動フラグ構成の変更（migrate change / ADR 0001 の管轄）
- openspec 本体・既存 opsx コマンドの改造

## Decisions

### 1. prompt は初回と2回目以降の2種の定型。進行判断は claude 自身

サーバは phase を意識せず定型の prompt で起動するが、初回（`--session-id` での新規起動）と2回目以降（`--resume` での継続）で定型を分ける。1本にするとコマンドの実行指示が継続の呼び出しでも再実行され、初回に会話へ載ったワークフロー定義の指示と噛み合わないためである。

- 初回: コマンドの実行指示＋最低限の固定指示のみ（全文は「定義ファイル全文」節）。対象の change は固定指示で「cwd のディレクトリ名と同名」と示し、動的値の差し込みを持たない（cwd = `sessions/<uuid>/` は実装済みの前提）
- 2回目以降: 続きを促す固定文のみ。コマンドは再実行せず、新しい入力はエージェントが取得スキルで読む
- 2回目以降の固定文はリトライと**同一の1本**に統合する。入力は prompt に載らず取得口から読む設計のため、「新しい入力が来た」と「リトライ」で文を区別する必要が無い（リトライ規定「入力を再送しない・続きを促す」もこの1本で満たす）
- 現行実装は2回目以降も初回と同じ `sessionPrompt` 全文を毎回送っており（`answer.post.ts` / `send-back.post.ts`）、本 change でこの2種の定型に置き換える
- prompt 無しの `--resume` は不可（headless では「Provide a prompt to continue the conversation」で拒否。実測 2.1.236）。継続の呼び出しにも必ず固定文を渡す

claude はコマンドの定義に従ってワークフロー定義から instruction を取得し、agent-api から状況（概要・strokes・send-back）を取得して、質問を続けるか proposal を起こすかを自分で判断する。

- 理由: 現行 `sessionPrompt` と同じ構造（1本の指示、進行判断は AI）。サーバに段の知識を持ち込まないことで、ワークフローの変更が定義ファイルの編集だけで完結する
- 代替案（却下）: サーバが phase に応じて段別コマンドを選ぶ — サーバと定義の段構成が結合し、段の追加・変更にコード変更が要る

### 2. ワークフロー定義は専用スキーマ（artifacts: stroke → proposal）

- `schema.yaml`: artifact は `stroke`（質疑応答）と `proposal`（起案）の2段
- instruction は「何をするか」の案内に徹する。API の受け渡し（URL・提出 JSON の組み立て）はセッション API スキル群（決定7）へ出し、instruction はスキルの呼び出しで流れを示す。全文は「定義ファイル全文」節に設計成果物として置く
- 環境値は instruction に直書きしない。動的値は prompt の添え書きから読み替える（定義は環境に依存しない）
- 提出 JSON の構造の典拠は migrate change の契約（`shared/api-contract.md`）とし、スキル側の実装とズレを防ぐ

### 3. 定義は共有1箇所に置き、store として登録する

- 定義はアプリ管理の1箇所に置き、`openspec store register` で登録する。claude は cwd（セッションディレクトリ）に依らず `--store <id>` で参照する
- セッション = この store 上の change。セッション作成時にサーバが change を作る（`openspec new change <sessionId> --store <id>` 相当）
- 理由: 定義を複製しない。編集が1箇所で済み、次回呼び出しから全セッションに反映される（ADR 0001 の「スキルを複製しない」と同じ原則）
- 代替案（却下）:
  - セッションディレクトリへ定義を複製 — 反映が新規セッション限定になり specs/workflow-definition を満たさない
  - user レベル schema（`~/.local/share/openspec/schemas/`）— 配置がアプリ管理の外に出て、デプロイ作業が散る
- store 登録・`--store` での instructions 取得・change 作成の実挙動の確認は tasks に含める（未実測）

### 4. コマンドは既存の opsx コマンド群をそのまま使う。新規に作らない

- ワークフローの入口として呼び出すのは既存の opsx コマンド（`--add-dir` 先リポジトリの `.claude/commands/opsx/*.md`）。入口のコマンドは新設しない（受け渡し用のセッション API スキル群は決定7で別途持つ）
- opsx コマンドは「openspec の instructions を取得してそれに従う」機構そのものであり、指示本文はスキーマ側にある。コマンド側に足すものがない
- どの opsx コマンドを呼ぶかは prompt 定型の一部として設定値に外出しする（ADR 0001 の起動フラグ外出しと同列。再ビルドなしで差し替え可能）
- 実測が必要: `claude -p`（`--setting-sources project` + `--add-dir`）から opsx コマンドが discover されるか。ADR 0001 で実証済みなのはスキルの load であり、コマンドは未確認

### 5. 反映の仕組み

サーバは定義を読まず、キャッシュも持たない。定義は claude が呼び出しごとに openspec CLI 経由でファイルから読む。これにより「コード変更・再ビルド・再起動なしで次回呼び出しから反映」が構造的に成立する。

### 6. 制約（spec から降ろしたもの）

- prompt に載せるのはコマンド指定と最低限の固定指示のみ（動的値の差し込みは無い）。ユーザー入力・ワークフローの指示本文を埋め込まない（migrate design 決定5 の原則を継承）
- 「CLI のセッションログに触れない」等の既存制約は migrate change の design に従う

### 7. API の受け渡しはセッション API スキル群が担う

instruction を「何をするか」の案内中心に保つため、agent-api との受け渡しの機構は専用スキルへ出す。`assets/.claude/skills/` の6本。

- `guidance`（一覧と詳説）/ `get-overview`・`get-strokes`・`get-send-back`（取得）/ `question`・`proposal`（提出）
- 取得系は `!` フェンスで curl を事前実行し、応答を本文に注入する。提出系は jq で JSON を組み立てて POST する（`question` は項目別の位置引数、`proposal` は全文をファイルパスで受ける）
- 接続先はサーバが spawn 時に渡す環境変数 `STROKE_BASEURL`（名称は実装時確定）から `$(printenv ...)` で解決し、セッション id は `${CLAUDE_SESSION_ID}` で自動解決する。`--session-id` の自前採番と一致することの実測は tasks に含める
- スキルの引数で渡すのは提出内容のみ。接続情報の引数は持たない
- フェンスの事前実行にも権限チェックがあり、`-p` では確認できず無言で中断する（num_turns 0、エラー表示なし）。必要なコマンドは skill の `allowed-tools` で事前承認する（`Bash(curl *)` / `Bash(jq *)` / `Bash(printenv *)`。環境変数の解決・コマンド置換が通ることは実測済み 2.1.236）
- 引数プレースホルダは `$name` 形式のみ有効。`${name}` は展開されない（`${}` で置換されるのは `${CLAUDE_*}` のみ。実測 2.1.236）
- 呼ぶ側に呼び先の引数系を書く: 取得系スキルの後書きが `/question` `/proposal` の完全形を案内する。呼ばれた側には書かない（呼ばれた時点で引数は渡り済みのため）

## 定義ファイル全文（設計成果物）

実装時はこの全文をそのまま定義ファイルへ載せる。instruction は「何をするか」の案内中心とし、API の受け渡しはセッション API スキル群（決定7）が担う。提出 JSON の細部は `shared/api-contract.md` とスキル実装で確定する。schema.yaml の項目構成は本リポジトリの `openspec/schemas/custom/schema.yaml`（openspec 1.9.0 で稼働中）に倣う。項目の要否の細部（`template` の省略可否・`apply` 節の要否）は実測で確定する。

### prompt 定型（全文）

初回（`--session-id` での新規起動）:

```
/opsx:<コマンド（設定値）>

次のセッションを進める。対象の change は cwd のディレクトリ名と同名。従う指示はワークフロー定義から取得すること。
```

2回目以降（`--resume` での継続。リトライも同文）:

```
続きを進めろ。状況は取得スキルで確認してから判断しろ。
```

差し込みはゼロ（セッション id は cwd 名／`${CLAUDE_SESSION_ID}`、接続先は spawn 時の環境変数 `STROKE_BASEURL` で届くため、prompt に動的値を載せる必要が無い）。どちらの定型にもユーザー入力・指示本文は載せない。

### schema.yaml（全文）

```yaml
name: stroke-session
version: 1
description: 概要からストロークを重ね、把握完了で proposal を起こすセッションワークフロー
artifacts:
  - id: stroke
    generates: stroke.md
    description: 質疑応答。フロンティアが空（把握完了）になるまでストロークを重ねる
    instruction: |
      ユーザーの要求を /get-overview を使って読み込む。

      /domain-modeling を使って grilling セッションを開始する。

      本ラウンドの質問がまとまったら
      /question '<header>' '<detail>' '<question>' '<options>' でユーザーに聞く。

      - 今までの記録を見たければ /get-strokes
      - セッションスキルの案内は /guidance

      /question を使ったらターンを終了しろ。

      フロンティアが空になったら、stroke.md に決定の一覧を書き出して、proposal を開始しろ。
    requires: []

  - id: proposal
    generates: proposal.md
    description: 把握完了後の proposal 起案と提出。差し戻しのたびに更新する
    template: proposal.md
    instruction: |
      初めての提出かどうかで分岐する。

      初めてなら、template の構成に従って proposal 全文（Markdown）を proposal.md に書き、
      /proposal '<filepath>' '<projectName>' で提出する。提出したらターンを終了しろ。

      初めてでなければ、まず /get-send-back で差し戻しの指摘を読む。
      対応方法は自分で判断して proposal.md を直し、
      /proposal '<filepath>' '<projectName>' で再提出する。再提出したらターンを終了しろ。

      ターンの補足:
      - 質問があれば /question '<header>' '<detail>' '<question>' '<options>' で引き続き聞ける
      - 今までのやり取りは /get-strokes で見れる
      - セッションスキルの案内は /guidance
    requires:
      - stroke
```

※意図あり: `stroke` の `generates: stroke.md` は、openspec の依存連鎖（`proposal` の `requires: stroke`）を成立させる完了マーカーを兼ねる。書くのは把握完了時で、そのタイミングの判断は claude 自身にある（進行判定を openspec に委ねる話ではない）。内容（把握した決定の一覧）は完了マーカーとして自然な記録を選んだもので、要確認。

### templates/proposal.md（全文）

```
## Why

## What Changes

## Capabilities

## Impact
```

### config.yaml（全文）

```yaml
schema: stroke-session
```

`context` は載せない。セッション固有の情報は agent-api から取得する原則のため、全セッション共通の静的な事項が生まれるまで空とする。

## Risks / Trade-offs

- [opsx コマンドが `--add-dir` 先から discover されない] → コマンドのロード経路（設置場所・setting-sources の構成）を実測して確定する。指示本文はスキーマ側にあるため、経路の調整で設計は変わらない
- [openspec CLI の更新で instructions 出力や store の挙動が変わる] → バージョンを固定し、アプリの依存として管理する（グローバル任せにしない）
- [スキルの受け渡しが agent-api 実装とズレる] → 典拠を `shared/api-contract.md` に一本化する
- [定義の破損や openspec 実行失敗で instruction が取れない] → 提出が無いままタイムアウト → 既存の失敗・リトライ規定（migrate change）に乗る。新規の失敗規定は設けない

## Migration Plan

1. store のセットアップとスキーマ・template の作成（instruction は api-contract から転記）
2. `claude -p` から opsx コマンドが discover されることの実測
3. `prompt.ts` を定型組み立てへ置換し、セッション作成時の change 作成を追加
4. 実測確認: `--store` 参照 / 定義編集の反映（specs のシナリオ）
- Rollback: `prompt.ts` を戻すのみ。定義ファイル・store 登録は残置しても無害

## Open Questions

- 使用する opsx コマンドの選定（propose / ff / continue 等のどれか）— 設定値なので後から差し替え可能。実測を踏まえて確定する
- 継続の固定文の文言 — 「続きを進めろ。状況は取得スキルで確認してから判断しろ。」を仮置き。実挙動を見て調整してよい（prompt 定型の調整だけで済む）
