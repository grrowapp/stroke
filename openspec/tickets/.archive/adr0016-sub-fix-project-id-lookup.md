---
order: -3.0
origin: agent
status: Wait-for-archive
tags:
  - proposal
  - specs
  - design
  - tasks
  - provide-operations-via-mcp/1efe8b7b-f95c-4774-bebe-0498f673be5f
  - fix-orphan-run-on-restart/42b86225-851f-4ec5-a58e-60a291d1877e
triage:
  - bug
change: adr0016-sub-fix-project-id-lookup
date: 2026-09-04
---

# adr0016-sub-fix-project-id-lookup

`server/utils/mcp/resolve-project-id.ts` は接続表の `projectPath` と本家の一覧の
`projectPath` を `resolve()` で突き合わせるが、**本家は渡されたパスを
`git rev-parse --show-toplevel` で解決してから登録する**（本家 2.2.5 `core/git-utils.js`）。

いまは `projectShareRoot` が `/opt/projects` で git リポジトリではないため一致している
（実測 2026-08-31）。**`projectShareRoot` が git 管理下へ動いた瞬間、本家の `projectPath` は
git のトップレベルへ化けて照合が外れる。** 登録簿には既にその形の例が在る（`agent-messanger`）。

失敗の出方も悪い。登録はあるのに `project_not_registered` になり、原因を取り違える。

出どころ: change `provide-operations-via-mcp` の santa-method レビュー 8・9周目（2026-08-31）。
ADR-0016 の委譲（後続）。

対応する change: `adr0016-sub-fix-project-id-lookup`

---

## 起票時の記述の訂正（2026-09-04）

**`agent-messanger` は「その形の例」ではない。** design.md の裏取り（2026-09-01、登録簿の
実物を読んだ）で分かったとおり、この登録の `projectPath` と `workflowRootPath` の食い違いは
**git 解決によるものではない**。`/home/vagrant/work/stroke-board/agent-messanger` に `.git` は
無く、同ディレクトリの `.mcp.json` が渡す `SPEC_WORKFLOW_SHARED_ROOT=/opt/projects/agent-messanger`
を `resolveGitRoot` が最優先で返した結果である。

**「`projectPath` と `workflowRootPath` が食い違う登録が現実に在る」という主張自体は正しい。**
誤っているのは、それを git 解決の実例として挙げた点である。git 解決でパスが化ける例は、
`projectShareRoot` が git 管理下へ入るまで登録簿に現れない。

この訂正は本 change の判断を変えない。むしろ `workflowRootPath` を第2の手掛かりにする案
（起票時の What Changes）を却下する根拠がこの観測である（design D2）。

## 進捗（2026-09-04 時点）

実装は入っている。`resolve-project-id.ts` は正規化したパスの完全一致で照合し、`error` 本文に
要求パスと一覧の中身を載せる。delta 2本（`mcp/server` MODIFIED・`upstream-connection`
ADDED / MODIFIED）は canonical と整合しており、他の change と衝突もない。

委譲した上位資料への整合反映は `update-docs-for-runtime-fixes`（2026-09-02 archive）で決着済み。

- `U1`（`upstream-observations.md` に「登録されるパスは git のトップレベルへ解決される」の節）— **反映済**
- `M2`（`errorCode` 表の `project_not_registered` の意味列）— **見送り**（ユーザー判断で不要）
- `D4`（基準版が資料・ADR-0008 は 2.2.7、実体は 2.2.5）— **反映済**

## この change がやること（2026-09-04 に確定）

**照合そのものは変えない。** 起票時は「照合を緩めて本家の解決の差を埋める」方向も含んで
いたが、ユーザー判断で採らないことにした。

`projectId` は解決後のパスから作られ、登録は projectId ごとに1件である。したがって
**解決でパスが変わる場面は、本家自身が複数のセッションを1つの `projectId` にまとめている
場面**である。そこで差を吸収して引き当てると、どのセッションにも同じ id が返る。

- 完全一致のまま — 引き当てが外れ、`project_not_registered` で止まる。**大きく失敗する**
- 差を吸収する — 引き当てが「成功」し、**別のセッションと共有の id で steering 文書を書く**。
  失敗として現れない

直したい場面で誤答するのだから、緩める理由が無い。加えて緩めると「そのパスがまだ本家に
登録されていない」という正しい失敗も隠れる。

**やることは `error` 本文の改善と、引き当ての手順の明文化**である。共有ルートを git 管理下に
置かないという運用上の前提は、そのまま前提として残る。

## 完了時に残したもの（2026-09-06）

ユーザー判断で完了・archive とした。次の2つは**済んでいない**。

- **実機での再確認（tasks 6.2）** — dev サーバーの起動を伴うため実行していない。照合の振る舞いは
  2026-09-01 の実測時と同じ（完全一致）で、変えたのは `error` 本文の組み立てだけ。そこは
  `yarn test` の 11 件が押さえている
- **`/opt/projects` 配下の後片付け（tasks 6.3）** — 2026-09-01 の実機確認で作ったセッションと
  プロジェクトが残っている。dev サーバーの停止とポート解放は確認済み

**成果物は未コミット。** コード（`server/utils/mcp/resolve-project-id.ts`・そのテスト・
`docs/adr/0016-delegate-provide-operations-via-mcp.md`）は worktree `pre5`、artifact は親
リポジトリにある。ブランチは作業中に `fix-orphan-run-on-restart` から
`adr0016-sub-fix-project-id-lookup` へ改名した（`tags` の記録は作業当時の名前のまま残す）。

## 畳む方向（起票時の想定。上の「完了時に残したもの」が現状）

次の3つが済めば archive できる。

1. **tasks 6.2** — 完全一致へ戻した実装で steering 工程を1周させ、あわせて引き当てを
   失敗させて `error` 本文から「一覧に何があったか」が読めることを実機で確認する。
   2026-09-01 の実機確認は照合を緩めた版で行っているため、再確認が要る
2. **tasks 6.3 の残り** — 実機確認で作ったセッションとプロジェクト（`/opt/projects` 配下）の
   片付け。dev サーバーの停止とポート解放は確認済み（2026-09-01）、作ったものの削除だけが
   ユーザー確認待ちで未実施
3. **tasks 8 章** — santa-method レビュー → commit → 完了承認＋`status` を `Wait-for-archive`
