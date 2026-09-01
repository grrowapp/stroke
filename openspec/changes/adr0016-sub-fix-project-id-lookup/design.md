# design — adr0016-sub-fix-project-id-lookup

## 何を決める文書か

projectId の引き当てを、本家 spec-workflow-mcp のパス解決の実装に依存しない形へ変える。あわせて、引き当てに失敗したときの `error` 本文を「登録されていない」としか読めない状態から直す。

`errorCode` を新設するかどうかと、上位資料（`docs/specs/reference/upstream-observations.md` / `docs/specs/api/mcp-tools.md`）への整合反映の提案を含む（issue-tracker.md「更新対応」(c)）。**上位資料は本 change の作業では書き換えない。** ADR-0004 の手続きに従い、ユーザー承認を得てから編集する。

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

結論（proposal / ADR-0016 の主張は成立する）:

- 本家は渡されたパスを `git rev-parse --show-toplevel` で解決してから登録する。git が使えない・git 管理下でないときだけ渡されたパスへフォールバックする
- `projectId` は**解決後**のパスの SHA-1（base64url 先頭16文字）である
- `GET /api/projects/list` の `projectPath` は解決後のパスである

### いまなぜ壊れていないか

`projectShareRoot` は `/opt/projects`（`nuxt.config.ts:232`）。`/opt/projects` にも `/opt` にも `.git` が無く、承認で作られたプロジェクト（例 `/opt/projects/setai-3`）にも `.git` が無い。よって `git rev-parse --show-toplevel` が失敗し、本家は渡された cwd をそのまま登録する。`resolve-project-id.ts` の文字列一致が成立するのはこの偶然による。

### 登録簿の実物

`SPEC_WORKFLOW_HOME` は `/opt/projects/.spec-workflow-mcp`（`nuxt.config.ts:236` の `specWorkflowHome`）。`activeProjects.json` の中身は2件。

| projectId | projectPath | workflowRootPath |
|---|---|---|
| `EsR5M2woKQ9OUss8` | `/opt/projects/stroke-board` | `/opt/projects/stroke-board` |
| `tLh761zAISCC1-qU` | `/home/vagrant/work/stroke-board/agent-messanger` | `/opt/projects/agent-messanger` |

**2件目の食い違いの原因は git ではない。** `/home/vagrant/work/stroke-board/agent-messanger` には `.git` が無く、同ディレクトリの `.mcp.json` が `SPEC_WORKFLOW_SHARED_ROOT=/opt/projects/agent-messanger` を渡している。`resolveGitRoot` は環境変数の明示指定を最優先で返す（`git-utils.js:36-40`）ので、`workflowRootPath` だけがそちらへ振れた。

この観測が意味するのは次の2点である。

1. `projectPath` と `workflowRootPath` が食い違う登録は現実に在る（proposal の主張は正しい）
2. しかし `workflowRootPath` は**引き当ての手掛かりにならない**。この例では起動 cwd が `/home/vagrant/work/stroke-board/agent-messanger` なのに `workflowRootPath` は `/opt/projects/agent-messanger` で、cwd との一致も祖先関係も無い

## 決定

### D1 — 照合を「一致または祖先」に変える

`GET /api/projects/list` の `projectPath` が、接続表が持つパスと**同じか、その祖先**であるエントリを候補とし、最も深いものを採る。

**なぜこれで足りるか。** 本家の解決（`git rev-parse --show-toplevel`）は、与えたパスを含む作業ツリーの根を返す。根は与えたパスの祖先か、与えたパスそのものである。git が使えないときは与えたパスそのものを返す。どちらの場合も「一致または祖先」に収まる。本家がこの手続きを別の実装へ変えても、**返るのがそのパスを含むディレクトリである限り**照合は成立する。

**なぜ「祖先」を許して安全か。** `/opt/projects/example` の下で起こしたセッションが `/opt/projects` に引き当たるのは、本家がそのセッションを `/opt/projects` の projectId で登録した場合だけである。そのとき本家自身がその2つを同一プロジェクトとして扱っているので、引き当ても同じ答えを返すのが正しい。逆に、祖先関係の無いエントリを引き当てることは無い。

**前方一致にしない。** `/opt/projects/example` が `/opt/projects/example-2` を拾わないよう、パス構成要素の境界でのみ祖先と判定する。既存テスト「正規化しても別物なら一致させない」がそのまま守られる。

**共有ルートが git 管理下へ移った場合の限界。** `projectShareRoot` が git リポジトリの内側へ動くと、その下の全セッションが同じトップレベルへ解決され、本家自身が全部を1つの projectId で登録する。引き当てはその1つを返すので照合は外れないが、**セッション同士が区別できない**。これは本家の仕様であってこの change では直せない。共有ルートは git 管理下に置かない、という運用上の前提は残る。design の範囲外の注意として記す。

### D2 — 却下した案

| 案 | 却下の理由 |
|---|---|
| `git rev-parse --show-toplevel` を自前で走らせて照合する | 本家の実装への依存を**複製**するだけ。本家が解決規則を変えれば同じ形で壊れる。加えて Nitro プロセスから毎回 subprocess を起こすことになる |
| `workflowRootPath` を第2の手掛かりにする | (1) `GET /api/projects/list` は `workflowRootPath` を**返さない**（`project-manager.js:198-205`）。(2) 登録簿を直読みしても、実物が示すとおり `workflowRootPath` は `SPEC_WORKFLOW_SHARED_ROOT` か `resolveGitRoot` で決まり、起動 cwd との一致も祖先関係も保証されない |
| 登録簿ファイル（`activeProjects.json`）を直接読む | `mcp/server`「ハンドラは対応する endpoint へ要求を発行してその応答だけから結果を作る」と `upstream-connection`「ファイルに触れるのは本家」に反する。上の理由で手掛かりとしても不十分 |
| `deriveProjectId()`（`server/utils/upstream/project-id.ts`）で id を導出して照合する | 本家は**解決後**のパスから id を作る。壊れる場面（解決でパスが変わる場面）では導出値が本家の id と一致しない。まさに直したい状況で効かない |

**proposal の「`workflowRootPath` など も見る」は採らない。** 上のとおり実装の事実と合わない。この食い違いは最終報告に記す。

### D3 — `errorCode` は新設しない

`docs/specs/api/mcp-tools.md`「同じ状況には全ツールで同じ `errorCode` を使う」と、specs `mcp/server` の同名の SHALL に照らして検討した。

新設案は「一覧に候補が1件も無い（`project_not_registered`）」と「一覧に候補はあるが照合が外れた（仮に `project_path_unmatched`）」を分けるものである。**採らない。**

- `errorCode` は**受け手が分岐するための値**である（`mcp/server`「前者は環境の問題で出し直しても無駄、後者はこちらのスキーマを直す問題であり、受け手の次の手が変わる」）。受け手は steering 工程の claude で、どちらの場合も自分で登録を直せない。次の手が変わらない
- `mcp/server` は表の5行を「これ以外を足してはならない（MUST NOT）」と閉じている。行を増やすには、増やす側に「受け手の分岐が増える」という根拠が要る。それが立たない
- 区別の必要そのものは実在する（proposal の 2 番目の What Changes）。ただしそれは**人が原因を追うため**の情報であり、`error` 本文が運ぶべきものである

したがって specs `mcp/server` には「新しい `errorCode` を割り当ててはならない」を明示し、代わりに `error` 本文の中身を規定した。

### D4 — `error` 本文に載せるもの

引き当てに使ったパスと、そのとき一覧が持っていたプロジェクトの名前とパスを含める。一覧が空だったのか、候補があって外れたのかが本文だけで判別できる形にする。

**本文の書き換え禁止には触れない。** `mcp/server` は「エラー本文を書き換え・省略・追加してはならない」を代行先が返した本文に対して課している。`project_not_registered` は代行先の応答が存在しない5行のうちの1つで、「`error` は代行先の本文ではなくツールが書いた理由になる」と明記されている。

**パスを本文に載せることの是非。** 一覧が返すパスは、同じホスト上で起動している本家のプロジェクトパスである。受け手は同じホストで動く claude で、自分の cwd を既に知っている。新たに漏れる秘密は無い。

## specs の delta

| capability | 操作 | 中身 |
|---|---|---|
| `mcp/server` | MODIFIED「結果は status と errorCode のフラットな形で返す」 | `project_not_registered` の `error` の中身を規定。新しい `errorCode` を割り当てない旨を明示。既存2シナリオを保持し、2つ追加 |
| `upstream-connection` | ADDED「パスから本家の projectId を引き当てる」 | 文字列一致を前提にしない。一致または祖先で照合し最深を採る。登録簿ファイルを読まない。本家のパス解決を再実行しない |
| `upstream-connection` | MODIFIED「本家の状態を定期ポーリングで取りに行かない」 | 下の「見つけた食い違い」を参照 |

### 見つけた食い違い（issue-tracker.md「見つけた者が責任を持って直す」）

`upstream-connection` の当該 Requirement は「本家 REST は画面が要求したときにのみ呼ぶ」と書いている。しかし親 change `provide-operations-via-mcp` の完了により、MCP ツール（`get-steering` / `submit-document` の steering 種別）が画面を介さず本家 REST を呼んでいる。ポーリング禁止という意図は変えず、要求元に MCP ツールを加える形で MODIFIED する。既存シナリオはそのまま保持した。

## 上位資料への整合反映（提案。ADR-0004 の手続きにより、ユーザー承認を得るまで書き換えない）

### 提案1 — `docs/specs/reference/upstream-observations.md` に節を1つ足す

同資料は「本家のソースを読んで確認した事実」の置き場で、現在パス正規化についての記述を1行も持たない。次の節を足すことを提案する。

> ## 登録されるパスは git のトップレベルへ解決される
>
> 本家は起動引数のパスをそのまま登録しない。`resolveGitWorkspaceRoot()`（`core/git-utils.js`）が `git rev-parse --show-toplevel` を実行し、成功すればその値を、失敗すれば渡されたパスを返す。この解決後の値が `workspacePath` になり、
>
> - `projectId` = `generateProjectId(workspacePath)`（SHA-1 → base64url → 先頭16文字）
> - 登録簿 `activeProjects.json` の `projectPath`
> - `GET /api/projects/list` の `projectPath`（`getProjectsList()` が `originalProjectPath` を返す）
>
> のいずれもがこの値になる。**`GET /api/projects/list` は `workflowRootPath` を返さない**（項目は `projectId` / `projectName` / `projectPath` / `instances` の4つ）。
>
> `workflowRootPath` は別の規則で決まる。`resolveGitRoot()` は環境変数 `SPEC_WORKFLOW_SHARED_ROOT` の明示指定を最優先で返し、無ければ `git rev-parse --git-common-dir` から主リポジトリのパスを求める。したがって `projectPath` と `workflowRootPath` は食い違いうる（実測 2026-09-01: `agent-messanger` は前者が `/home/vagrant/work/stroke-board/agent-messanger`、後者が `/opt/projects/agent-messanger`。後者は `.mcp.json` の `SPEC_WORKFLOW_SHARED_ROOT` による）。

**版の食い違いを1件添える。** 同資料の冒頭は調査対象を v2.2.7 と書き、ADR-0008 も基準を 2.2.7 と定めている。今回読んだ実体（`npx ... @latest` の解決先、および `/home/vagrant/work/spec-workflow/node_modules/`）はどちらも **2.2.5** だった。`server/utils/upstream/project-id.ts` のコメントも「基準 2.2.7」と書いている。基準版の記述をどう扱うかはこの change の範囲外だが、資料へ反映するときに合わせて判断が要る。

### 提案2 — `docs/specs/api/mcp-tools.md` の `errorCode` 表の1行の説明を直す

D3 のとおり行は増やさない。ただし `project_not_registered` の「意味」列が「本家の一覧に対象のプロジェクトが無い」のままだと、照合が外れた場合を含むことが読めない。次の書き換えを提案する。

| 値 | status | 意味 | 出どころ |
|---|---|---|---|
| `project_not_registered` | 404 | 本家の一覧から対象の `projectId` を引き当てられない（一覧が空の場合と、候補はあるが対応しない場合の両方を含む。どちらかは `error` 本文で分かる） | 本家 |

## 影響範囲

| ファイル | 変更 |
|---|---|
| `server/utils/mcp/resolve-project-id.ts` | 照合を一致または祖先へ。最深を採る。`error` 本文の組み立て |
| `test/server/utils/mcp/resolve-project-id.test.ts` | 既存8件は振る舞いを保つ。祖先一致・最深選択・前方一致の除外・`error` 本文のケースを追加 |

**触らないもの** — `server/utils/mcp/connection-table.ts`（接続表が持つのは起動 cwd のままでよい。変換は照合側の責務）、`server/utils/upstream/registry.ts`（登録簿の読み取りは巡回の関心で、引き当てには使わない）、`server/utils/upstream/project-id.ts`（`deriveProjectId` は破棄経路のためのもので、D2 のとおり引き当てには使えない）、`nuxt.config.ts`。

## Open Questions

無し。`workflowRootPath` を使うかどうかは実装の事実（一覧が返さない・手掛かりとして不十分）で決着しており、ユーザー判断を要する分岐は残っていない。上位資料への整合反映2件は承認が要るが、これは tasks の中で依頼する項目であって未解決の設計論点ではない。
