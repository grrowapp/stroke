# design — adr0016-sub-fix-project-id-lookup

## 何を決める文書か

projectId の引き当てに失敗したときの `error` 本文を、「登録されていない」としか読めない状態から直す。あわせて、引き当ての手順——完全一致で照合する・本家の解決でパスが変わった差を吸収しない・登録簿を読まない・本家の解決を再実行しない——を規定として残す。

`errorCode` を新設するかどうかと、上位資料（`docs/specs/reference/upstream-observations.md` / `docs/specs/mcp/tools.md`）への整合反映の提案を含む（issue-tracker.md「更新対応」(c)）。**上位資料は本 change の作業では書き換えない。** ADR-0004 の手続きに従い、ユーザー承認を得てから編集する——この2件は `update-docs-for-runtime-fixes` へ委譲し、決着済みである（下の「上位資料への整合反映」）。

## 裏取り（すべて実物を読んで確認した。2026-09-01）

### 本家のソース

読んだ実体は次の2つで、`core/git-utils.js` は両者で**バイト一致**する。

| 場所 | 版 |
|---|---|
| `/home/vagrant/.npm/_npx/2e56504aabcef5f9/node_modules/@pimzino/spec-workflow-mcp` | 2.2.5 |
| `/home/vagrant/work/spec-workflow/node_modules/@pimzino/spec-workflow-mcp` | 2.2.5 |

前者が `npx -y @pimzino/spec-workflow-mcp@latest` の解決先である（`server/utils/stroke/invoke.ts` の `mcpConfigFor` がこの形で起こす）。

**登録に至る経路**（`dist/index.js` → `dist/core/project-registry.js`）。

```js
// dist/index.js:169-172
const rawProjectPath   = filteredArgs[0] || process.cwd();     // ← invoke.ts が渡す cwd
const expandedPath     = expandTildePath(rawProjectPath);
const workspacePath    = resolveGitWorkspaceRoot(expandedPath);
const workflowRootPath = noSharedWorktreeSpecs ? workspacePath : resolveGitRoot(workspacePath);
```

```js
// dist/core/git-utils.js:16-27
export function resolveGitWorkspaceRoot(projectPath) {
    try {
        const workspaceRoot = execSync('git rev-parse --show-toplevel', {
            cwd: projectPath, ...GIT_EXEC_OPTIONS
        }).trim();
        return workspaceRoot || projectPath;
    }
    catch { return projectPath; }
}
```

```js
// dist/core/project-registry.js:155-185
async registerProject(projectPath, pid, options = {}) {
    const workspacePath    = resolve(projectPath);                                  // ← 既に git 解決済み
    const workflowRootPath = resolve(options.workflowRootPath || projectPath);
    const projectId        = generateProjectId(workspacePath);
    ...
    const entry = { projectId, projectPath: workspacePath, workflowRootPath, projectName, instances: [...] };
}
```

**一覧に載る値**（`dist/dashboard/project-manager.js` → `dist/dashboard/multi-server.js:323`）。

```js
// project-manager.js:142 / 198-205
originalProjectPath: entry.projectPath,   // 登録簿の projectPath（= git 解決後）をそのまま持つ
getProjectsList() {
    return Array.from(this.projects.values()).map(p => ({
        projectId: p.projectId,
        projectName: p.projectName,
        projectPath: p.originalProjectPath,   // ← 一覧が返すのはこれ
        instances: p.instances
    }));
}
```

事実として確定したのは次の3点。

- 本家は渡されたパスを `git rev-parse --show-toplevel` で解決してから登録する。git が使えない・git 管理下でないときだけ渡されたパスへフォールバックする
- `projectId` は**解決後**のパスの SHA-1（base64url 先頭16文字）である
- `GET /api/projects/list` の `projectPath` は解決後のパスであり、**`workflowRootPath` は返らない**（項目は `projectId` / `projectName` / `projectPath` / `instances` の4つ）

**登録は projectId ごとに1件である。** 同じ解決結果になったパスは同じ `projectId` を持ち、一覧には1エントリしか現れない。決定1 はこの性質から導く。

### いまなぜ壊れていないか

`projectShareRoot` は `/opt/projects`（`nuxt.config.ts:232`）。`/opt/projects` にも `/opt` にも `.git` が無く、承認で作られたプロジェクト（例 `/opt/projects/setai-3`）にも `.git` が無い。よって `git rev-parse --show-toplevel` が失敗し、本家は渡された cwd をそのまま登録する。`resolve-project-id.ts` の完全一致が成立するのはこの前提による。

### 登録簿の実物

`SPEC_WORKFLOW_HOME` は `/opt/projects/.spec-workflow-mcp`（`nuxt.config.ts:236` の `specWorkflowHome`）。`activeProjects.json` の中身は2件。

| projectId | projectPath | workflowRootPath |
|---|---|---|
| `EsR5M2woKQ9OUss8` | `/opt/projects/stroke-board` | `/opt/projects/stroke-board` |
| `tLh761zAISCC1-qU` | `/home/vagrant/work/stroke-board/agent-messanger` | `/opt/projects/agent-messanger` |

**2件目の食い違いの原因は git ではない。** `/home/vagrant/work/stroke-board/agent-messanger` には `.git` が無く、同ディレクトリの `.mcp.json` が `SPEC_WORKFLOW_SHARED_ROOT=/opt/projects/agent-messanger` を渡している。`resolveGitRoot` は環境変数の明示指定を最優先で返す（`git-utils.js:36-40`）ので、`workflowRootPath` だけがそちらへ振れた。

この観測が意味するのは次の2点である。

1. `projectPath` と `workflowRootPath` が食い違う登録は現実に在る。ただし**これは git 解決の実例ではない**（ticket「起票時の記述の訂正」）
2. `workflowRootPath` は**引き当ての手掛かりにならない**。この例では起動 cwd が `/home/vagrant/work/stroke-board/agent-messanger` なのに `workflowRootPath` は `/opt/projects/agent-messanger` で、cwd と対応していない

## 決定

### D1 — 照合は完全一致で行う。本家の解決でパスが変わった差を吸収しない

**決定**: 一覧の `projectPath` と要求パスを正規化して比べ、一致したときだけ引き当てる。本家の解決（`git rev-parse --show-toplevel`）でパスが変わって一致しなくなったときは、引き当てを外し `project_not_registered` で止める。差を埋める仕組みを持たない。

**なぜ差を吸収してはならないか。** 裏取りのとおり `projectId` は解決後のパスから作られ、登録は projectId ごとに1件である。したがって**解決でパスが変わる場面は、本家自身が複数のセッションを1つの `projectId` にまとめている場面**である。そこで差を吸収して引き当てると、どのセッションに対しても同じ id が返る。

- 一致だけで引き当てる — 引き当てが外れ、`project_not_registered` で止まる。**大きく失敗する**
- 差を吸収して引き当てる — 引き当てが「成功」し、**別のセッションと共有の id で steering 文書を書く**。失敗として現れない

直したい場面で誤答するのだから、緩める理由が無い。完全一致がそこで安全弁になっている。

**もう1つ、緩めると「まだ登録されていない」が隠れる。** 本家への登録は、そのパスで起こした claude が本家 MCP を繋いだ後に起こる。それより前の引き当ては外れるのが正しい。一致しないものを通す仕組みを入れると、この正しい失敗が消える。

**残る前提。** 共有ルートを git 管理下に置かない、という運用上の前提はそのまま残る。その前提が崩れる場面は本家自身がセッションを区別できないので、引き当て側では直せない。前提は `docs/specs/reference/upstream-observations.md`「登録されるパスは git のトップレベルへ解決される」に記録済み。

### D2 — 却下した案

| 案 | 却下の理由 |
|---|---|
| `git rev-parse --show-toplevel` を自前で走らせて照合する | 本家の実装への依存を**複製**するだけ。本家が解決規則を変えれば同じ形で壊れる。加えて Nitro プロセスから毎回 subprocess を起こすことになる |
| `workflowRootPath` を第2の手掛かりにする | (1) `GET /api/projects/list` は `workflowRootPath` を**返さない**（`project-manager.js:198-205`）。(2) 登録簿を直読みしても、実物が示すとおり `workflowRootPath` は `SPEC_WORKFLOW_SHARED_ROOT` か `resolveGitRoot` で決まり、起動 cwd との対応が保証されない |
| 登録簿ファイル（`activeProjects.json`）を直接読む | 引き当ては MCP ツールの代行経路にあり、`mcp/server`「ハンドラは対応する endpoint へ要求を発行してその応答だけから結果を作る」に反する。上の理由で手掛かりとしても不十分。**なお登録簿の読み取りそのものは禁じられていない**——`server/utils/upstream/registry.ts` がアクティブ判定に使っており、ADR-0006「アクティブ判定だけを `activeProjects.json` / 本家 API で重ねる」が認めている。`upstream-connection`「本家に書き込まない」は状態を**変える**操作の規定で、読み取りには掛からない（santa-method レビュー 2周目の指摘、2026-09-04） |
| `deriveProjectId()`（`server/utils/upstream/project-id.ts`）で id を導出して照合する | 本家は**解決後**のパスから id を作る。解決でパスが変わる場面では導出値が本家の id と一致しない |

**proposal 起票時の「`workflowRootPath` など も見る」は採らない。** 上のとおり実装の事実と合わない。proposal は取り下げ後の形に書き直してある。

### D3 — `errorCode` は新設しない

`docs/specs/mcp/tools.md`「同じ状況には全ツールで同じ `errorCode` を使う」と、specs `mcp/server` の同名の SHALL に照らして検討した。

新設案は「一覧に候補が1件も無い（`project_not_registered`）」と「一覧にプロジェクトはあるが対応しない（仮に `project_path_unmatched`）」を分けるものである。**採らない。**

- `errorCode` は**受け手が分岐するための値**である（`mcp/server`「前者は環境の問題で出し直しても無駄、後者はこちらのスキーマを直す問題であり、受け手の次の手が変わる」）。受け手は steering 工程の claude で、どちらの場合も自分で登録を直せない。次の手が変わらない
- `mcp/server` は表の5行を「これ以外を足してはならない（MUST NOT）」と閉じている。行を増やすには、増やす側に「受け手の分岐が増える」という根拠が要る。それが立たない
- 区別の必要そのものは実在する。ただしそれは**人が原因を追うため**の情報であり、`error` 本文が運ぶべきものである

したがって specs `mcp/server` には「新しい `errorCode` を割り当ててはならない」を明示し、代わりに `error` 本文の中身を規定した。

### D4 — `error` 本文に載せるもの

引き当てに使ったパスと、そのとき一覧が持っていたプロジェクトの名前とパスを含める。一覧が空だったのか、プロジェクトはあるが対応しなかったのかが本文だけで判別できる形にする。

**本文の書き換え禁止には触れない。** `mcp/server` は「エラー本文を書き換え・省略・追加してはならない」を代行先が返した本文に対して課している。`project_not_registered` は代行先の応答が存在しない5行のうちの1つで、「`error` は代行先の本文ではなくツールが書いた理由になる」と明記されている。

**パスを本文に載せることの是非。** 一覧が返すパスは、同じホスト上で起動している本家のプロジェクトパスである。受け手は同じホストで動く claude で、自分の cwd を既に知っている。新たに漏れる秘密は無い。

## specs の delta

| capability | 操作 | 中身 |
|---|---|---|
| `mcp/server` | MODIFIED「結果は status と errorCode のフラットな形で返す」 | `project_not_registered` の `error` の中身を規定。新しい `errorCode` を割り当てない旨を明示。既存2シナリオを保持し、2つ追加 |
| `upstream-connection` | ADDED「パスから本家の projectId を引き当てる」 | 一覧の応答だけを手掛かりにする。完全一致で照合する。本家の解決でパスが変わった差を吸収しない（理由つき）。登録簿ファイルを読まない。本家のパス解決を再実行しない |
| `upstream-connection` | MODIFIED「本家の状態を定期ポーリングで取りに行かない」 | 下の「見つけた食い違い」を参照 |

### 見つけた食い違い（issue-tracker.md「見つけた者が責任を持って直す」）

`upstream-connection` の当該 Requirement は「本家 REST は画面が要求したときにのみ呼ぶ」と書いている。しかし親 change `provide-operations-via-mcp` の完了により、MCP ツール（`get-steering` / `submit-document` の steering 種別）が画面を介さず本家 REST を呼んでいる。ポーリング禁止という意図は変えず、要求元に MCP ツールを加える形で MODIFIED する。既存シナリオはそのまま保持した。

## 上位資料への整合反映（`update-docs-for-runtime-fixes` へ委譲。決着済み）

ADR-0004 の手続きに従い、本 change では `docs/` を書き換えず、委譲先で承認を経て決着させた（同 change は 2026-09-02 archive）。

### 提案1 — `docs/specs/reference/upstream-observations.md` に節を1つ足す → **反映済**（`U1`）

同資料に「登録されるパスは git のトップレベルへ解決される」の節が入っている。内容は本家の `resolveGitWorkspaceRoot` → `git rev-parse --show-toplevel`、`projectId` の導出規則、`GET /api/projects/list` が `workflowRootPath` を返さないこと、`projectPath` と `workflowRootPath` が食い違いうること（実測例 `agent-messanger`）。

**基準版の食い違いも同時に決着した**（`D4`）。同資料と ADR-0008 は基準を v2.2.7 としていたが、実体（`npx ... @latest` の解決先、および `/home/vagrant/work/spec-workflow/node_modules/`）はどちらも **2.2.5** だった。

### 提案2 — `docs/specs/mcp/tools.md` の `errorCode` 表の説明を直す → **見送り**（`M2`）

`project_not_registered` の「意味」列を「一覧が空の場合と、候補はあるが対応しない場合の両方を含む」へ広げる案。ユーザー判断で不要とされた。行は増やさない（D3）方針は変わらない。

**当初この提案は `docs/specs/api/mcp-tools.md` を当て先にしていたが、そのパスは存在しない。** 2026-09-02 の api 資料の分割で、MCP ツールの資料は `docs/specs/mcp/tools.md` である。

### 提案3 — `docs/adr/0016-delegate-provide-operations-via-mcp.md` の当該節を直す → **承認を得て反映済**（2026-09-04）

santa-method レビュー（2026-09-04）が見つけた。ADR-0016 の `#### adr0016-sub-fix-project-id-lookup` 節が、delta と**正面から矛盾**している。

- **323行「対処」** — 現在「`projectPath` の一致だけに頼らず、…で照合する」と、照合を緩める案を掲げている。delta は「本家の解決でパスが変わった差を吸収して引き当ててはならない（MUST NOT）」なので、そのままでは ADR が採らなかった案を規定し続ける
  - 提案: 「**照合は完全一致のままとし、本家の解決でパスが変わった差を吸収しない。** 差が出る場面では本家自身が複数のセッションを1つの `projectId` にまとめているため、吸収して引き当てると別のセッションと共有の id を返し、steering 文書を取り違えて書く。引き当てが外れて `project_not_registered` で止まるほうを採る。引き当てられなかったときに『登録されていない』と『一覧にプロジェクトはあるが対応しない』を区別できるようにする（`errorCode` は増やさず `error` の本文で区別する）」へ差し替える
- **313行「成果物」** — 現在「proposal のみ（specs・design・tasks 未作成）」。実際は proposal / specs（2本）/ design / tasks が揃っている
  - 提案: 「proposal・specs（`mcp/server`・`upstream-connection`）・design・tasks」へ更新する

`docs/agents/issue-tracker.md`「specs に delta を入れるとき、それを規定する上位資料（docs・ADR）があるなら、上位資料への整合反映までが change の責務範囲である」に当たる。ADR-0004 の手続きにより**ユーザー承認を得るまで書き換えない。**

## 影響範囲

| ファイル | 変更 |
|---|---|
| `server/utils/mcp/resolve-project-id.ts` | `error` 本文の組み立て（D4）。照合は完全一致のまま変えない（D1） |
| `test/server/utils/mcp/resolve-project-id.test.ts` | 既存は振る舞いを保つ。`error` 本文のケースを追加 |

**触らないもの** — `server/utils/mcp/connection-table.ts`（接続表が持つのは起動 cwd のままでよい）、`server/utils/upstream/registry.ts`（登録簿の読み取りは巡回の関心で、引き当てには使わない）、`server/utils/upstream/project-id.ts`（`deriveProjectId` は破棄経路のためのもので、D2 のとおり引き当てには使えない）、`nuxt.config.ts`。

## Open Questions

無し。`workflowRootPath` を使うかどうかは実装の事実（一覧が返さない・手掛かりとして不十分）で決着している。上位資料への整合反映2件も委譲先で決着済み。ADR-0016 への反映（提案3）は承認待ちだが、これは tasks の中で依頼する項目であって未解決の設計論点ではない。
