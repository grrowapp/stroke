# adr0016-sub-switch-workflow-to-mcp-tools Design

## Context

- 操作系の MCP ツール6本は `provide-operations-via-mcp` で提供済み。案内のツール（`get-guide` / `get-steering-guide`）は対の2 change で追加済み
- ワークフロースキーマの実体は**リポジトリの外**にある（`~/.local/share/openspec/schemas/flontier-strokeflow/`。配置手順は README）。サーバは定義を読まずキャッシュも持たないので、編集は次回の呼び出しから効く（`openspec/specs/workflow-definition`）
- 動機と範囲は proposal.md を参照
- 用語: 「instruction」= schema.yaml の artifact ごとの指示文。「案内」= 工程の進め方の本文

## Goals / Non-Goals

**Goals:**

- instruction が名指す操作を、実在する MCP ツールの名前に揃える
- `agent/invocation` の Requirement を実装へ揃え、`provide-operations-via-mcp` が残した食い違いを閉じる
- 代行対象になった curl スキルを撤去し、同じ操作の入口が2つある状態を終わらせる

**Non-Goals:**

- 案内のツールそのものの追加（対の2 change で済んでいる）
- ツールの実処理化（`adr0016-sub-implement-mcp-operations`）
- `docs/` の改訂（`adr0016-sub-document-mcp-operations`）

## Decisions

### Decision: instruction は「何をするか」だけを書き、手順は `get-guide` に預ける

instruction には artifact（stroke / proposal）ごとの**そこで作るもの**だけを書き、進め方は `get-guide` を呼ばせる。

現在の instruction は手順そのものを書いている（問いの立て方・ターンの終わり方・分岐）。同じ内容が `get-guide` の本文にもある。両方に書けば、ツールの契約が変わったとき instruction だけが古くなる——それが `/write-steering-v2` の失敗の形である（設定側だけが実体を失っても誰も気付かなかった）。

instruction を空にして全部ツールへ寄せる案も不採用。schema.yaml は artifact の構造（`stroke` → `proposal` の依存、template）を持っており、**どの成果物を今作るのか**はツールからは分からない。そこだけを instruction に残す。

### Decision: 名前の偶然一致に頼っていたことを記録に残す

いまエージェントが動いているのは、`/get-overview` という指示が `get-overview` という MCP ツール名と**たまたま一致している**からである。一致しない `/question`・`/proposal`・`/guidance`・`/domain-modeling` は読まれても何も起こらない。

この事実を spec（`workflow-definition` の ADDED）に書く。書かないと、次に instruction を書く者は同じ形式を踏襲する。

### Decision: スキルは9本だけ撤去し、`template/` は残す

撤去するのは代行対象になった9本（`get-overview` / `get-strokes` / `get-send-back` / `question` / `proposal` / `guidance` / `get-product` / `get-tech` / `get-structure`）。`assets/.claude/skills/template/` は残す。

雛形（proposal・product・tech・structure）は**中身がまだ使われる**——`get-guide` / `get-steering-guide` の本文が書くべき項目を挙げており、その出どころがここにある。撤去すると、次に手順を直す者が何を根拠に項目を並べたのか辿れなくなる。

ファイルを消すのが安全なのは、**ロードの経路が既に無い**からである（`--add-dir` を外したので `assets/` は claude に見えない）。撤去は「読まれているものを取り上げる」のではなく「読まれない残骸を片付ける」作業である。

### Decision: `agent/invocation` の食い違いを本 change で閉じる

「AI は実際のスキルとして走る」は `--add-dir` の撤去で成り立たなくなった。`provide-operations-via-mcp` は「外す判断は本 change の範囲外」としてコードのコメントに注記だけを残し、spec は直していない。

CLAUDE.md「更新対応」の「specs が docs と食い違っていたら、見つけた者が責任を持って直す」に従い、本 change で閉じる。**別 change を新たに起こさない**のは、この change の Modified Capabilities が既に `agent/invocation` を挙げており、instruction の書き換えと同じ「入口を MCP ツールへ一本化する」判断の一部だからである。

## Risks / Trade-offs

- [instruction を誰も読んでいない可能性がある] → 実運用ログで、エージェントが `openspec` コマンドを1度も叩いていない（`tool_use` の `Bash` が0回。実測 2026-08-30）。**読まれている証拠が無い**。書き換えても効かないなら、`workflow-definition` の「定義の変更が次の提出物に現れる」Requirement 自体が満たされていないことになる。tasks で**まず読まれているかを測り**、読まれていなければその事実を記録して次の change へ送る
- [スキル撤去で復旧手段が消える] → 復旧は git から戻せる。かつ操作の入口は MCP ツールだけと決めてある（`provide-operations-via-mcp` の受け入れ条件）ので、二重の入口を残す理由が無い
- [`--strict-mcp-config` を spec の既定値に書くと、他の呼び出し方を縛る] → 縛るのが目的である。個人の MCP 設定が8サーバー・約80ツール流れ込んでいた（実測 2026-08-30）

## Migration Plan

1. instruction が読まれているかを測る（デバッグログの `tool_use` に `Bash(openspec …)` が現れるか）。結果をどちらでも tasks に記録する
2. `~/.local/share/openspec/schemas/flontier-strokeflow/schema.yaml` の instruction 2本を書き換える。操作は MCP ツール名で指し、手順は `get-guide` を指す
3. `assets/.claude/skills/` から9本を削除する（`template/` は残す）
4. spec の delta を当てる（`agent/invocation` の REMOVED / ADDED / MODIFIED、`workflow-definition` の ADDED）
5. 実機で1周させ、往復が成立することを確かめる

戻すときは schema.yaml とスキルを git から戻す。ただし操作の入口は MCP ツールだけなので、戻しても旧経路は動かない（`--add-dir` が無い）。
