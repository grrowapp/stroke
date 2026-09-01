# design

## Context

動機は [proposal.md](./proposal.md) の Why にある。ここでは、二択を決めるのに要る事実だけを置く。**すべて実装と本家 2.2.5 のソースを読んで裏を取ったもので、推測は含めない。**

### いま起きていること

| 場所 | いまの状態 |
|---|---|
| `server/utils/stroke/invoke.ts` `buildRun`（steering 分岐） | `withMcpToolsAllowed(claude.args, [MCP_SERVER_ALLOWED_TOOL, UPSTREAM_MCP_ALLOWED_TOOL])` で `mcp__specworkflow` を `--allowedTools` へ足す |
| `server/utils/mcp/allowed-tools.ts` | `UPSTREAM_MCP_ALLOWED_TOOL` を定義し、足す理由を「配るだけでは一覧に出るのに1つも呼べず、『呼べないものを見せてから失敗させない』（specs `mcp/server`）を破る」と注記（santa-method レビュー 4周目 2026-08-30） |
| `server/mcp/tools/get-steering-guide.ts` | 「## 本家 MCP は使わない」の節で「**この工程では1つも呼ばない。**」「**`approvals` も呼ばない。**」と述べる |
| `test/server/utils/stroke/invoke.test.ts:194` | 「steering 工程は本家 MCP も `--allowedTools` に載せる（配るだけで呼べない状態にしない）」を肯定で検証 |
| `test/server/mcp/tools/get-steering-guide.test.ts:25` | 節「本家 MCP は使わない」に `/approvals/` `/呼ばない/` が在ること・本文 230 文字以上を検証 |

許可（呼べる）と案内（呼ぶな）が正面から食い違い、**守っているのは案内の散文だけ**である。

### 本家 MCP を配線している目的（ソースで確認）

`@pimzino/spec-workflow-mcp@2.2.5` の `dist/server.js` は `initialize()` の中で、**stdio transport を繋ぐ前**に登録簿へ自己登録する。

```js
// dist/server.js:60-63
const projectId = await this.projectRegistry.registerProject(this.workspacePath, process.pid, {
    workflowRootPath: this.projectPath
});
console.error(`Project registered: ${projectId}`);
```

登録はプロセスの起動そのもので済み、**ツール呼び出しは1本も要らない**。登録の場所は `SPEC_WORKFLOW_HOME` が決め（`mcpConfigFor` が渡している）、ポータルはその同じ登録簿を読む。登録の生存は PID で管理される（`dist/core/project-registry.js` の `isProcessAlive` / `cleanupStaleProjects`）。

### 本家 MCP のツール5本を呼ばせてよいか（ソースで確認）

`dist/tools/` に在るのは `approvals` / `spec-workflow-guide` / `steering-guide` / `spec-status` / `log-implementation` の5本。

| ツール | 呼ばせられない理由 |
|---|---|
| `approvals` | `request` は `'VERBAL APPROVAL NOT ACCEPTED'` と `` `Poll status with: approvals action:"status" approvalId:"${approvalId}"` `` を返す（`dist/tools/approvals.js:266-269`）。`status` も pending なら `'Continue polling with approvals action:"status"'`（:323）。**無人の実行はポーリングでタイムアウトまで使い切る。** 案内が述べている根拠はこれで、ソースで確認できた |
| `steering-guide` / `spec-workflow-guide` | 本家のワークフロー（`.spec-workflow/` の構造・dashboard での承認）を前提にした手順を返す。従うと `submit-document` を通らない道へ行く（`get-steering-guide.ts` 冒頭が自前の案内を持つ理由として述べているもの） |
| `spec-status` / `log-implementation` | `.spec-workflow/` を直接読み書きする経路。`docs/specs/api/mcp-tools.md`「操作の入口はこれだけである。ファイルの直読み・直書きも、コマンドによる代行も採らない」に正面から反する |

**呼ばせてよいものが1本も無い。**

### `--allowedTools` が決めるのは可視性ではない

`--allowedTools` は許可の allowlist であって、ツール一覧から消す仕組みではない。**実測の裏がある**——`--strict-mcp-config` を足す前の実行（デバッグログ全23本・2026-08-30）で、個人の MCP 8本・約80ツールが「`--allowedTools` に無いので**呼べないまま**」実行のツール一覧に並んでいた（`nuxt.config.ts` の注記、`provide-operations-via-mcp` 6.2 の5周目）。

つまり **`mcp__specworkflow` を許可へ足しても、一覧の見え方は1文字も変わらない。** 変わるのは「呼べば通る」だけである。

## Goals / Non-Goals

**Goals**

- 許可と案内の食い違いを、構造の側で決着させる
- 決めた側を `docs/specs/api/mcp-tools.md` と `docs/specs/core/settings-reference.md` へ整合させる案を出す（**提案までで、この change では書き換えない**）

**Non-Goals**

- 本家 MCP の配線そのものを変えること（ADR-0011 の決め）。`--mcp-config` に並べるのは続ける
- 本家 MCP を stroke-board 側で別に常駐させて claude から見えなくすること（D3 で不採用）
- `--allowedTools` の `Write` / `Edit` の要否（`adr0016-sub-fix-direct-write-allowance` の範囲）
- 承認依頼の作成そのものの設計（本家 `approvals` に口が1つしか無いことは変わらない）

## Decisions

### D1. 許可から外す。案内は残して、構造の裏づけを持たせる

**決定: `mcp__specworkflow` を `--allowedTools` から落とす。** `buildRun` の steering 分岐を `withMcpToolsAllowed(claude.args)`（自前の MCP ツールのみ）にし、`allowed-tools.ts` の `UPSTREAM_MCP_ALLOWED_TOOL` を落とす。`UPSTREAM_MCP_SERVER_NAME` は `mcpConfigFor` が使うので残す。

根拠は4つ。

1. **配線の目的は許可なしで果たされる。** 自己登録は `initialize()` で済み、ツール呼び出しを要さない（Context）。許可を外しても steering 工程は成立する
2. **呼ばせてよいツールが1本も無い。** 5本すべてに、呼ばせられない理由がソース上にある（Context）。「許可はするが1本も呼ぶな」は、許可に意味が無いまま危険だけが残る状態である
3. **許可を足しても「見せてから失敗させない」は達成できない。** `--allowedTools` は可視性を決めない（Context）。4周目の判断は、**達成できない目的のために、達成してはならない状態（呼べば通る）を作っていた。** 得たものが無く、失うものだけがある
4. **`mcp/server` の「呼べないものを見せてから失敗させない」には機構が付いている。** あの規定は `x-mcp-tools` で接続ごとに絞れる stroke-board 自身の `/mcp` について書かれている。stdio の本家 MCP に同じ機構は無い。**機構の無い相手へ結論だけを移すと、取れる手が「呼べるようにする」しか残らない**——4周目に起きたのがこれである

**残る不利益を隠さない。** 本家のツールは一覧に残り、呼べば拒否される。「見せてから失敗させる」形にはなる。ただしこれは**許可を足しても同じ**で、A を選んだことで新しく生じる不利益ではない。生じる差は「呼んだときに通るか、拒否されるか」だけであり、拒否される側が正しい。

### D2. 案内は消さない。散文を第一の守りから第二の守りへ降ろす

一覧から消せない以上、**呼ばせない責務は案内が併せて負う**（specs `agent/invocation`）。節「本家 MCP は使わない」は残し、次を書き換える。

- 「配線されているが**許可されていないので呼んでも通らない**」を事実として書く（いまは「呼ばない」という規範だけ）
- `approvals` の段は残す。**理由の説明として要る**——「呼んでも通らない」だけだと、エージェントは回避策（ファイル直書き・別経路）を探しに行く。「承認はこの工程の終わりの条件ではない」まで書いてあることが効いている
- 節の見出しは変えない。テストが見出しで節を引いている

**代替案（案内から節ごと落とす）は不採用。** 一覧に残るものについて何も言わないと、エージェントは1度は呼びに行き、拒否を受けて探り回る。`get-guide` に失敗する道具を1行入れただけで 10 回の `Bash` と 156 秒を費やした実測（`provide-operations-via-mcp` の記録 2026-08-31）が、そのコストの実例である。

### D3. 本家 MCP を claude から外し、stroke-board 側で常駐させる案は採らない

これは二択の外にある第3の手で、**唯一「一覧に見せない」を達成できる**。それでも採らない。

- 登録は PID の生存で管理される（`isProcessAlive`）ので、stroke-board がプロセスの寿命を持つことになる。落ちたとき・再起動したときの後始末が無い問題は既に記録されている（`provide-operations-via-mcp`「実行の途中でサーバーが再起動すると、孤児と二重起動が残る」）。同じ穴をもう1つ増やす
- ADR-0011 が決めた配線を変える大きさで、この change（許可と案内の食い違いの解消）の範囲を超える
- 得られるのは「一覧に出ない」だけで、**呼ばれても通らない**という結果は D1 と同じである

将来この重さを払う判断が出たときのために、ここに残す。

### D4. `--disallowedTools` へは足さない

`--disallowedTools`（いまは `Bash(cd *)`）に `mcp__specworkflow` を足せば意図は明示できるが、採らない。

- `--disallowedTools` は `nuxt.config.ts` の設定側にあり、`--allowedTools` の MCP 分は呼び出しごとに組み立てる側にある。**片方だけに足すと「本家 MCP をどう扱うか」が2箇所に散る**
- allowlist 方式では「載せない = 呼べない」で足りる。二重に書いても防御は増えない

### D5. `agent/invocation` に「配線と許可は別」を書き、`mcp/server` の適用範囲を閉じる

specs の delta は3本になる（proposal は2本を挙げていた。差分は「この change で新たに見つけたもの」ではなく、**4周目の誤りの発生源が `mcp/server` の文言にある**という判断による）。

- `agent/invocation` — MODIFIED。「呼び出しごとに足してよい MCP ツールは自前のものだけ」「配線と許可は別」「許可は可視性を決めない → 呼ばせない責務は案内が併せて負う」を、既存の「呼び出し側がフラグを足す」規定へ足す
- `mcp/server` — MODIFIED。「接続には工程で使うツールだけを見せる」が **stroke-board 自身の `/mcp` にだけ掛かる**ことを明記し、絞りの機構を持たない相手へ理由だけを広げることを MUST NOT にする。**この1文が無いと、次に読む者が同じ一般化をやり直す**
- `mcp/tools/steering-guide` — ADDED。案内が本家 MCP について述べることと、それが許可と一致していなければならないこと

## Risks / Trade-offs

- [本家のツールは一覧に残り、エージェントが1度は呼ぶかもしれない] → D2 の案内で先に伝える。呼んでも拒否で終わり、状態はどこも変わらない。実機の1周（tasks 4章）で、実際に呼びに行くかをデバッグログで見る
- [`--allowedTools` に無いツールの拒否が、`claude -p` でどう返るかを実測していない] → tasks 4章で実機1周を回し、デバッグログで拒否の形とターン数の消費を確認する。**ここは推測で spec を書いていない**——spec が述べているのは「実行されず拒否として返る」までで、返り方の形は述べていない
- [案内の文言を変えると `get-steering-guide.test.ts` が落ちる] → 節の見出しと必須の語（`approvals` / `呼ばない`）は保つ。最低文字数 230 は本文が増える方向なので当たらない。tasks 3章でテスト側も併せて見る
- [`invoke.test.ts:194` の肯定テストが、この change で意味を反転する] → 「載せる」を「載せない」に変えるだけでは、`--allowedTools` ごと落ちても通る否定テストになる。**フラグが在ること・自前のツールが載っていることを肯定で見た上で、本家が載っていないことを見る**形にする（`flontier 工程には本家 MCP を許可しない` が既に採っている書き方）
- [承認依頼の作成が、これで完全に閉じる] → 元から閉じている。案内が「呼ぶな」と述べ、実測でも 1 度も呼ばれていない。この change は**その状態を構造で保証するだけ**で、機能を削らない

## 上位資料への整合反映（提案。**この change では書き換えない**）

issue-tracker.md「更新対応」に従い、design で提案しユーザー承認を得てから反映する。**承認前に `docs/` を書き換えない。**

### 提案1. `docs/specs/api/mcp-tools.md` — 冒頭「操作の入口はこれだけである」に、本家 MCP の扱いを1段落足す

いまの冒頭はこう述べている。

> 操作の入口はこれだけである。ファイルの直読み・直書きも、コマンドによる代行も採らない。

**「本家 MCP のツールも入口ではない」が、この文からは読み取れない。** steering 工程には本家 MCP が並んで配線されており、いま許可にも載っているので、「これだけ」の外にもう1つ呼べる口が実在している。足す案（節「工程ごとの公開」の末尾、または冒頭の直後）:

> steering 工程には本家 spec-workflow の MCP も配線されるが、**そのツールは入口ではない。** 配線の目的は起動時の登録簿への自己登録だけで、ツール呼び出しは1本も要らない。したがって本家 MCP のツールは `--allowedTools` に載せず、呼んでも通らない。
>
> ただし `--allowedTools` は可視性ではなく許可を決めるので、**本家のツールはエージェントの一覧には残る。** 絞りの機構（`x-mcp-tools`）を持つのは stroke-board 自身の `/mcp` だけで、stdio の本家 MCP には無い。一覧から消せない分は `get-steering-guide` の案内が担う——「呼ばない」と「呼んでも通らない」の両方を述べる。

### 提案2. `docs/specs/core/settings-reference.md` — 起動フラグの記述から `mcp__specworkflow` を落とす

いまの記述（`claude.args` の節）:

> `-p` / `--output-format json` と、`--session-id` / `--resume` と会話 id、`--mcp-config`、**MCP ツール分の `--allowedTools`**（`mcp__stroke-board`。steering 工程では `mcp__specworkflow` も）、`--` 以降の prompt は**呼び出しごとに決まる**ため、この定義には含まれない。

案:

> …**MCP ツール分の `--allowedTools`**（`mcp__stroke-board`。**両工程ともこれだけで、steering 工程で並ぶ本家 MCP のツールは載せない** — [mcp-tools.md](../api/mcp-tools.md)）、…

**手続きの注記。** proposal と ADR-0016 は「ADR-0004 の手続きに従い」と書いているが、**ADR-0004 は 2026-08-29 に archive 済み**で、規範の正は `docs/specs/core/settings-reference.md` 冒頭の規定（change を起こす＋ユーザー承認）と issue-tracker.md「更新対応」へ移っている。従う先はそちらである（archive 済み ADR は規範の参照先にならない）。

### 提案3. `docs/adr/0016-delegate-provide-operations-via-mcp.md` — 状態行の「確定していないもの」から1本消す

この change が閉じたら、後続3本のうち `fix-upstream-mcp-allowance` は docs へ落ちたことになる。状態行の「確定していないもの」から外し、残り2本にする。**3本すべてが落ちるまで archive にはしない**（取りこぼす規約が残る）。

## Open Questions

無し。二択は D1 で決着している。実機で確かめる項目（拒否の返り方・エージェントが呼びに行くか）は tasks 4章にあり、**結果によって specs も方針も変わらない**（どちらでも「呼べない」は成立する）ため、Open Question ではなく検証項目として置く。
