# design: adr0016-sub-fix-direct-write-allowance

動機は proposal.md「Why」。ここは**どう確かめて、どう倒すか**だけを書く。

## Context

### いまの値と、いまの説明

`nuxt.config.ts:285-301` の起動定義。

```ts
'--allowedTools', 'Skill Bash(openspec *) Read Edit Write',
'--disallowedTools', 'Bash(cd *)',
```

MCP 分（`mcp__stroke-board`、steering 工程では `mcp__specworkflow` も）は設定に持たず、`server/utils/mcp/allowed-tools.ts` の `withMcpToolsAllowed` が呼び出しごとに追記する。**この change が触るのは設定側の5つだけ**で、`withMcpToolsAllowed` の畳み込みの実装には手を入れない。

同じ値が `docs/specs/core/settings-reference.md:145` にも写してある（設定の正はそちら。ADR-0004）。

添えてあるコメントは `nuxt.config.ts:288-290`。

> curl / jq / printenv は落とした（取得・提出を MCP ツール以外で真似る余地を残さない・ユーザー指示 2026-08-27）。`Write` は develop 側の追加で、proposal を `docs/proposal.md` に書くのに要るので残す

### 説明が事実と違う（確認済み）

**`docs/proposal.md` を書くのはサーバーである。** `server/utils/stroke/session-store.ts:290` に「セッションから見た proposal の位置。`docs/proposal.md` を書くのはここ1箇所だけ。」とあり、実際に書くのは A7（`server/api/strokes/[id]/proposal.post.ts` の `sessionProposal(sessionId).write(proposal)`）である。エージェントは `submit-document`（`type: "flontier"`）で本文を渡すだけで、書き手ではない。**コメントの根拠は成立していない。**

**ただし「要らない」の証明にはならない。** `Write` が入った本当の経緯は別にある。コミット `1ce89cfc`（2026-08-26）の本文がそれで、当時の理由は proposal の書き出しではなく**ワークフロー定義が要求する artifact の新規作成**だった。

> workflow は把握完了時に stroke.md、提出時に proposal.md の新規作成を要求するが、8/25 の絞り込みで Write が落ち、headless では承認できずリトライ上限まで空振りしていた。Edit は既存ファイルの編集のみで新規作成を代替できない。

つまり `Write` の要否は「誰が `docs/proposal.md` を書くか」ではなく、**手順がエージェントにファイルの書き出しを求めているか**で決まる。

### 手順は、いまも書き出しを求めている（片方だけ）

| 手順の出どころ | 書き出しの要求 | 届いているか |
|---|---|---|
| ワークフロー定義 `~/.local/share/openspec/schemas/flontier-strokeflow/schema.yaml` | **ある**。`generates: stroke.md` / `proposal.md`、stroke 段の instruction に「stroke.md に決定の一覧を書き出して proposal の段へ進め」 | **届いていない見込み**（下記） |
| `server/mcp/tools/get-guide.ts`（flontier の案内。2026-08-31 に追加） | **無い**。「やらないこと」に「ファイルを直接読み書きして状態を知ろうとしない」「**`openspec` コマンドを叩かない。** このセッションの openspec ルートには change が無く、`openspec instructions` は失敗する。ここに書いた手順が工程のすべてである」 | 届く（`firstPrompt` が名指しで呼ばせる） |
| `server/mcp/tools/get-steering-guide.ts`（steering の案内） | **無い**。「ファイルを直接書いて回避しない——それは提出を経ていないので、この工程の成果にならない」 | 届く |

ワークフロー定義の instruction は `openspec instructions` を叩かないと読めない。案内はそれを名指しで禁じている。**だから schema.yaml の書き出し要求はエージェントに届いていない**——`/opt/projects` の全セッション（7本）を見て `stroke.md` は1つも無い、という事実がこれと符合する。ただし「届いていない」を実行の記録で直接確かめてはいない（下の「確かめた範囲」）。

### 実測で分かっていること

`/opt/projects` のセッションディレクトリを直接見た（2026-09-01）。

| セッション | cwd 直下にエージェントが書いたファイル | `docs/proposal.md`（サーバーが書く） |
|---|---|---|
| `5d34fd6b-…`（8/30 21:17） | **`proposal.md` 3250 B** | 3249 B。差は末尾改行1つだけ |
| `31b55ff6-…`（8/30 21:39） | **`proposal-setai.md` 4213 B** | 4212 B |
| 他5本 | 無し | 有り（`7c64137b-…` は未提出） |

**`Write` は実際に使われた。** ただし用途は「提出の経路」ではなく**下書き**である——同じ本文をファイルに書いてから `submit-document` で出しており、提出は正しくツールを通っている。

そしてこの2本はどちらも **2026-08-30**、`get-guide` が入る（`4a6f10d0`、2026-08-31）**前**の実行である。案内が「ファイルを直接読み書きしない」と言い出したのは後だから、この2件は現在の構成の証拠にならない。proposal が言う「直近3実行のいずれも `Write` / `Edit` を1度も使っていない」は現在の構成での話だと読めるが、**この change の調査では裏を取れなかった**——`claude.debugLogDir` は既定の空で、`.stroke-check/debug-log/` は空だった。実行の記録が残っていない。

`Edit` については、使われた形跡も使われていない証拠も見つからなかった。

### 外さないと何が起きるか

steering 工程は cwd が昇格先のプロジェクトなので、`Write` があればエージェントは `.spec-workflow/steering/{product,tech,structure}.md` を**直接書ける**。書けば「文書が3本ある」状態は成立するが、提出（`submit-document` の `type: "steering"`）を経ていない。`scripts/stroke-check.ts:784-820` はこれを見越して、文書の有無ではなく `submit-document` の呼び出し回数で着地を判定している（santa-method レビュー 9周目）。**道具の側で塞げば、この迂回そのものが無くなる。**

## Goals / Non-Goals

**Goals**

- `Skill` / `Bash(openspec *)` / `Read` / `Edit` / `Write` の**使用実績を1周の実測で数え**、要否の判定を事実の上に置く
- 要らないと判定した `Write` / `Edit` を許可から外し、外したあとに1周（flontier + steering）が通ることを実機で確かめる
- 残す道具には、実測に裏付けられた根拠をコメントとして書き直す
- 上記を `docs/specs/core/settings-reference.md` へ整合反映する（ADR-0004 の手続き。**この design での提案 → ユーザー承認 → 編集**）

**Non-Goals**

- MCP ツールの契約（`docs/specs/api/mcp-tools.md` のツール一覧・結果の形・`errorCode`）は変えない
- `withMcpToolsAllowed` の畳み込みの実装は変えない。触るのは設定の値だけ
- `--disallowedTools` / `--setting-sources` / `--strict-mcp-config` / `--add-dir` は触らない
- ワークフロー定義（`~/.local/share/openspec/schemas/flontier-strokeflow/schema.yaml`）の instruction は書き換えない。担当は `adr0016-sub-switch-workflow-to-mcp-tools`（決定4を参照）
- 本家 MCP（`mcp__specworkflow`）の許可は扱わない。`adr0016-sub-fix-upstream-mcp-allowance` の範囲

## Decisions

### 決定1: 要否は「1周を回して実行の記録を数える」で判定する

**採る**——`claude.debugLogDir` を一時的に設定して `yarn check:stroke` で1周を回し、生出力の `tool_use` を道具名で数える。`Skill` / `Bash(openspec *)` / `Read` / `Edit` / `Write` の5つすべてについて回数を出し、tasks の記録に残す。

代替として「ソースを追って呼び出し経路が無いことを示す」を検討したが、**取れない**。これらはエージェントが自分の判断で呼ぶ道具で、呼び出し元はコードではなく手順の文とモデルの裁量である。静的には「手順が求めていないこと」までしか言えず、「モデルが自発的に使わないこと」は言えない。実際、`get-guide` 以前の2セッションは誰にも求められずに下書きを書いていた。

**1周には steering 工程を含める。** `--allowedTools` は flontier と steering の両方に同じ値が渡り、直接書きの危険が大きいのは steering の側である。承認まで進めるオプションは `adr0016-sub-add-stroke-check-approval-option` が入れる。それが未了なら、承認だけブラウザで押して steering 工程の実行をログに残す（ADR-0016「操作がブラウザのみで完結する」）。

### 決定2: 既定は「外す」に倒す。残すのは実測が要ると示したときだけ

判定の既定値を「外す」に置く。理由は非対称である。

- 外して足りなければ、実行が空振りして**そのターンのログに残る**。取り返しがつく
- 残して要らなければ、迂回の経路が**黙って残る**。`docs/specs/api/mcp-tools.md`「操作の入口はこれだけである。ファイルの直読み・直書きも、コマンドによる代行も採らない」は破れているのに、破れたことは誰にも見えない

`Write` と `Edit` は別々に判定する。片方だけが要ることがある（コミット `1ce89cfc` が言うとおり、`Edit` は新規作成を代替できない。逆に下書きの手直しは `Edit` を要求しうる）。

### 決定3: 外すのは `Write` / `Edit` だけ。他の3つは「数えて、記録して、別 change へ渡す」

同じ実測で `Skill` / `Bash(openspec *)` / `Read` の回数も出る。これらも要否が確かめられていない点は同じで、`Read` に至っては `mcp-tools.md` が名指しで禁じる「ファイルの直読み」そのものである（`get-guide` の「やらないこと」にも「ファイルを直接読み書きして状態を知ろうとしない」とある）。`Bash(openspec *)` は案内が「叩くな」と明言している。

それでも**この change では外さない**。理由は2つ。

- proposal と ticket が範囲を `Write` / `Edit` と宣言しており、判定基準（決定2）と実機確認（1周）が書き込みの経路を前提に組んである。読みの道具を同時に外すと、失敗したときにどちらが原因か切り分けられない
- `Skill` は役割分担（操作系＝MCP ツール / 案内＝Skill）の受け皿として意図して残してある（`nuxt.config.ts:275-279`）。要否の話ではない

**ただし「範囲外」として黙って落とさない。** 実測の数字を tasks の記録に残し、`Read` / `Bash(openspec *)` の許可を外す判断が要るなら**その場で change を起票する**（ADR-0016「範囲外の扱いは不正だった」ユーザー指摘 2026-09-01）。起票するかどうかは実測の結果で決める。

### 決定4: ワークフロー定義の instruction には手を入れない。順序の規定だけを specs に置く

`schema.yaml` はまだ `stroke.md` / `proposal.md` の生成を求めている。書き換えの担当は `adr0016-sub-switch-workflow-to-mcp-tools`（ADR-0016「残るのは instruction の書き換えだけである」）で、実体はリポジトリの外（`~/.local/share/openspec/schemas/`）にある。この change が同じファイルを触ると担当が二重になる。

代わりに specs へ**順序の規定**を置いた——「手順が求めている書き出しを残したまま、その道具を許可から外してはならない」。この規定に対して、いまの構成は次のどちらかで満たされる。

- **満たされている**（見込み）: 案内が `openspec` コマンドを禁じているので schema.yaml の instruction はエージェントに届かない。届かない要求は「求めている」に当たらない
- 満たされていなければ、`Write` を外す前に instruction 側の要求を取り除く必要がある = `adr0016-sub-switch-workflow-to-mcp-tools` の完了を待つ

どちらかは決定1の実測で決まる（ログに `Bash(openspec …)` の `tool_use` が現れるか）。**先に決めつけない。** tasks 1章の結果を見てから 2章へ進む。

### 決定5: コメントは「何を根拠に、何のために」の形へ書き直す

外す場合も残す場合も、いまの1文（「`Write` は develop 側の追加で、proposal を `docs/proposal.md` に書くのに要るので残す」）は消す。書き直しの形を揃える。

- **外した場合**: 何を外したか、どの実測で要らないと判断したか（日付・1周の内容・使用回数0）、外したことで何が塞がるか（提出を経ない steering 3本の直接書き）
- **残した場合**: 何のために要るか、**どの実測がそれを示したか**（回数と、使われた場面）。「develop 側の追加で」のような由来だけの説明は根拠にしない

## 上位資料への整合反映（提案・ユーザー承認が要る）

ADR-0004 の手続きに従い、**承認を得るまで下記に手を付けない**。

### `docs/specs/core/settings-reference.md`

| 箇所 | いまの記述 | 提案 |
|---|---|---|
| `:145`（`claude.args` の JSON） | `"--allowedTools", "Skill Bash(openspec *) Read Edit Write",` | 判定の結果に合わせて値を更新する（外す場合は `"Skill Bash(openspec *) Read"`） |
| `:152-159` 付近の散文 | `--add-dir` / `--strict-mcp-config` / `--setting-sources` にはそれぞれ「なぜそうするか」の段落がある。**`--allowedTools` にだけ無い** | `--allowedTools` の段落を新設する。「許可するのは実測で要ると確かめた道具だけ」「取得・提出は MCP ツールが唯一の入口であり、成果物をファイルへ直接書ける道具を許可しない（`docs/specs/api/mcp-tools.md`）」「MCP 分は呼び出しごとに追記されるのでこの定義には含まれない（`:161` と重複させず、そちらを指す）」 |

### 触らない上位資料

- `docs/specs/api/mcp-tools.md` — 「操作の入口はこれだけである」はこの change が**従う**規定であって、変える対象ではない。契約は変わらない
- `docs/adr/0016-delegate-provide-operations-via-mcp.md` — 状態行の「確定していないもの」に本 change が載っている。archive の判断は ADR-0016 全体の話で、この change の責務ではない（CLAUDE.md「更新対応」）
- `docs/adr/0001-claude-p-invocation.md` — `--setting-sources` の規定。触らない

## Risks / Trade-offs

- **[実測の1周が `Write` を使わなくても、次の1周が使うとは限らない]** → モデルの裁量に依るので、1周では「使わないこともある」までしか言えない。だから決定2で判定の既定を「外す」に置き、外したあとの1周で**空振りが起きないこと**を確かめる。外した状態で通れば、使われても使われなくても成立する
- **[外したことで proposal の質が落ちる]**（下書きをファイルに置けなくなる） → 外したあとの1周で、提出された proposal の本文を読んで確かめる。落ちていたら「残して根拠を書き直す」へ倒す。判定を外す方向に固定しない
- **[`debugLogDir` を有効にすると概要・問い・proposal の全文が残る]** → `settings-reference.md:126` の規定どおり、検証が終わったら空へ戻し、残ったファイルを手で消す。tasks の片付け章に入れる
- **[検証中に別の worktree の dev が動いていると、巡回が相手のセッションを再キックする]**（ADR-0016「影響」） → 検証時は dev を1つだけ動かす。`projectShareRoot`（`/opt/projects`）は worktree 間で共有される
- **[`stroke-check` の着地判定が `submit-document` の回数に依存する]** → `Write` を外しても、この判定は残す。道具で塞ぐことと、着地を提出で測ることは別の守りである

## Migration Plan

1. 実測（`debugLogDir` を一時的に設定 → 1周 → 回数を数える → 空へ戻して片付け）
2. 判定 → `nuxt.config.ts` の値とコメントを直す
3. 上位資料への整合反映（**ユーザー承認の後**）
4. 外した構成で1周を通す（flontier + steering）

ロールバックは `nuxt.config.ts` の1行を戻すだけで済む（設定値であり、再ビルドを要さない——specs `agent/invocation`「起動設定は再ビルドなしで変更できる」）。

## Open Questions

無し。要否の判定は tasks 1章の実測が答える。判定がどちらに出ても進め方は決定2〜5で決まっており、specs も tasks も変わらない。
