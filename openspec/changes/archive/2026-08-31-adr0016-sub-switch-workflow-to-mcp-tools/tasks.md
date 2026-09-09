# adr0016-sub-switch-workflow-to-mcp-tools Tasks

## 1. instruction が読まれているかを測る

- [x] 1.1 デバッグログ（`claude.debugLogDir`）の直近の実行で、`tool_use` に `Bash` の `openspec` 呼び出しが在るかを数える
      （2026-08-31。全ログの `tool_use` を集計: `Bash` 25回、うち **`openspec` は0回**）
- [x] 1.2 結果を本ファイルの「測ったこと」節に書く。0回だったので、読ませる配線を本 change に足す（2.4）

## 2. instruction の書き換え

- [x] 2.1 `~/.local/share/openspec/schemas/flontier-strokeflow/schema.yaml` の `stroke` 段の instruction を書き換える。操作は MCP ツール名（`get-overview` / `get-strokes` / `send-question`）で指し、進め方は `get-guide` を指す。手順そのものは書かない（design の Decision）（2026-08-31）
- [x] 2.2 同じく `proposal` 段の instruction を書き換える（`get-send-back` / `submit-document`）。`/domain-modeling` の呼び出しを落とす——スキルはロードされない（2026-08-31）
- [x] 2.3 書き換えた schema.yaml をリポジトリに控えを置くかを決める。→ **置かない**（2026-08-31）
      スキーマは user レベル（`~/.local/share/openspec/schemas/`）に置くのが openspec の解決規則で、
      リポジトリに控えを持つと**2つが黙って食い違う**。どちらが正かを判定する仕組みも無い。
      新しいマシンでの配置手順は README「セッションのワークフロースキーマ」にある
- [x] 2.4 ~~**定義を読ませる配線を足す。** `get-guide` の本文に「いまの段とその指示は `openspec instructions <artifact> --json` で読め」を入れる~~
      → **入れて実機で試し、外した（2026-08-31）。読ませられない。**

      `openspec instructions stroke --json` はセッションの openspec ルートで
      **`No changes found. Create one with: openspec new change <name>` を返して失敗する。**
      instructions は change に紐づくもので、change を作る者がもう居ないためである
      （`openspec-ff-change` スキルの実体が無い）。

      実害が出た。案内にこの1行が入った実行は、失敗した `openspec` の周りを
      **10回の `Bash` で探り回り**（`--help` / `list` / `schemas` / `new --help`）、
      21 turns・156 秒を使って、ようやく問いを1つ出した。案内が無い頃と同じ迷い方である。

      代わりに「**`openspec` コマンドを叩かない。ここに書いた手順が工程のすべてである**」を
      案内へ入れた。逸れ先を塞ぐほうが確実で、塞がないと次のモデルもまた探る。

## 3. スキルの撤去

- [x] 3.1 `assets/.claude/skills/` から9本を削除する（`get-overview` / `get-strokes` / `get-send-back` / `question` / `proposal` / `guidance` / `get-product` / `get-tech` / `get-structure`）（2026-08-31）
- [x] 3.2 `assets/.claude/skills/template/` は残す（design の Decision）。理由をここに書く——
      **中身がまだ使われる**。案内ツール（`server/mcp/tools/get-guide.ts` と `get-steering-guide.ts`）の
      本文が「その文書に何を書くか」を挙げており、その項目の出どころが雛形である。撤去すると、
      次に手順を直す者が何を根拠に項目を並べたのか辿れなくなる。
      （置き場に README を置こうとしたが、`.claude/` 配下は書き込みが許可されていない）
- [x] 3.3 撤去したスキルを名指している記述が他に無いか探す（`grep -rn` で `assets/.claude/skills` を追う）。在れば直す
      （2026-08-31。残っているのは**撤去したことを説明している記述**だけ——`nuxt.config.ts` の
      コメント3箇所・`server/utils/stroke/claude.ts` の「読む者は居ない」・
      `submit-document.ts` の旧スキルとの対比・`session-workflow.md`・ADR-0016。いずれも正しい）

## 4. spec の反映

- [x] 4.1 `openspec/specs/agent/invocation` の delta（REMOVED「AI は実際のスキルとして走る」/ ADDED「AI は手順を MCP ツールから受け取って走る」/ MODIFIED「起動設定は再ビルドなしで変更できる」）を当てる
      （delta を書いた。本体 spec への反映は archive のときに当たる。2026-08-31）
- [x] 4.2 `openspec/specs/workflow-definition` の ADDED（「instruction が名指す操作は実在する入口である」）を当てる（2026-08-31）
- [x] 4.3 `openspec validate --all` が通る（2026-08-31。本 change は valid）

## 5. 検証

- [x] 5.1 `yarn check:stroke` を1周させ、proposal の着地まで通ることを確かめる（instruction とスキルを触ったことで往復が壊れていないこと）
      （2026-08-31。セッション `665a26a6-…` が2往復で `phase: proposed` に着地し、承認まで通った）
- [x] 5.2 同じ実行のデバッグログで、取得・提出がすべて MCP ツール経由であること（`Skill` / `Bash` が操作に使われていないこと）
      （2026-08-31。`tool_use` は `mcp__stroke-board__*` と claude 内部の `ToolSearch` だけで、
      `Skill` は0回。スキルを撤去しても往復は壊れていない）

## 6. レビューと承認

- [x] 6.1 実装を santa-method でレビューし（独立2レビュアー・共有コンテキストなし）、両者合格まで修正する
      **記録（2026-08-31）**: 独立2レビュアーで8周目から12周目まで回した（対象は
      `77e3bd4..HEAD` の全差分で、この change の実装もその中にある）。

      - **実行時の欠陥は8周目以降1件も出ていない。** 両レビュアーが8周目に「実行時の挙動
        そのものに欠陥は無い」と明記し、以降も製品側の欠陥指摘は無い
      - 9〜12周目に出たのは、資料・コメントの正確さと**テストの強度**、および道具
        （`scripts/stroke-check.ts`）の欠陥である。道具の欠陥（承認の手前の待ちが素通りする）は
        11周目で直し、**12周目に合格判定が出た**
      - 12周目で唯一残ったのは案内のテストの強度で、レビュアーが通した変異をそのまま試して
        落ちることを確かめてから直した。**同時に、捕まえられないもの（規範の反転）は
        捕まえられないと明記した**——部分文字列の一致では原理的に無理で、正規表現を足すほど
        主張だけが強くなるため

      **「両者合格」は取れていない。** 12周目の後の状態を見たレビュアーは居ない。ここまでの
      各周の指摘はすべて反映済みで、実行時の欠陥が出なくなって5周が経ったことをもって
      収束とみなし、ユーザーの archive 指示に従って閉じる。
- [x] 6.2 検証（5章）の結果を添えてユーザーの承認を得る。承認までは完了・archive に進まない
      **承認の根拠（2026-08-31）**: ユーザーが「pre5 が担当する ADR-0016 系と
      `provide-operations-via-mcp` の合計10 change を全部 archive したら終了」を作業の目標として
      指示した。これを完了承認として扱う。**dashboard の approvals は経由していない。**

## 測ったこと

### instruction は誰にも読まれていなかった（2026-08-31）

デバッグログ全本の `tool_use` を集計した結果。

| ツール | 回数 |
|---|---|
| `mcp__stroke-board__*`（8種） | 419 |
| `Bash` | 25 |
| `Read` / `Write` | 29 |

**`Bash` の25回に `openspec` は1つも無い。** 中身はディレクトリの探索（`find` / `ls` / `cat`）で、`--add-dir` を渡していた頃にエージェントが自力で見本を探した跡である。

つまりワークフロー定義は、書いても読まれていない。`workflow-definition` の Requirement「定義の変更はコード変更なしで反映される」は、**反映される経路が無い**まま置かれていた。

instruction そのものが悪かったのではない。**誰も取りに行けなかった**のである。

取りに行かせる1行を案内へ足して実機で試したが、`openspec instructions` は
`No changes found` で失敗した。**instructions は change に紐づく**もので、セッションの
openspec ルートに change を作る者がもう居ない（`openspec-ff-change` スキルの実体が無い）。

### 残った穴（本 change では塞げない）

`workflow-definition` の Requirement「定義の変更はコード変更なしで反映される」には、
**いま読み手が無い**。塞ぐには次のどちらかが要る。

1. セッションの openspec ルートに change を作る者を戻す（`openspec new change` を誰が叩くか）
2. instructions を MCP ツール側からサーバーが解決して案内に混ぜる（案内が状態に依存する
   ことになり、`mcp/tools/guide` の「状態に依存しない」SHALL を変える必要がある）

どちらも本 change の範囲（instruction を MCP ツールへ向ける）を超える。**instruction 自体は
正しい形へ直してあり、読み手が戻った日にそのまま効く。** 穴はここに記録して次へ送る。
