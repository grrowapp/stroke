import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

/**
 * 本家の `projectId` を、workspace のパスから導く。
 *
 * **本家と同じ式で作る。** `@pimzino/spec-workflow-mcp` の `core/project-registry.js`
 * （基準 2.2.7）にこうある。
 *
 * ```js
 * export function generateProjectId(absolutePath) {
 *   const hash = createHash('sha1').update(absolutePath).digest('base64url');
 *   return hash.substring(0, 16);   // 先頭16文字
 * }
 * ```
 *
 * hex ではなく **base64url** で、先頭16文字だけを使う。渡すのは `resolve()` 済みの
 * workspace のパスである（`registerProject` が `resolve(projectPath)` を渡している）。
 *
 * **なぜ導出が要るか。** registry は生きたインスタンスがある間しか残らない。steering を
 * 書けずに終わったプロジェクトは本家に登録されたことがなく、registry から `projectId` を
 * 引けない。それでも破棄のリクエストは `projectId` で組む必要がある
 * （`DELETE /api/projects/:projectId`）。
 *
 * **ここに置くのは、本家に触る知識を接点へ閉じるためである**（structure.md の
 * Module Boundaries）。画面はサーバーが返した値を使うだけで、id の作り方を知らない。
 *
 * 一般のプロジェクト（外から置かれたもの）では workspace のパスが分からないので導けない
 * （design.md 決定1）。導けるのは**自分で作ったもの**だけである——MCP へ渡した cwd が
 * そのまま workspace になるためで、それは `<projectShareRoot>/<name>` に等しい。
 */
export function deriveProjectId(
  /**
   * **本家が id の材料にしているのは `workspacePath`**（`project-registry.js:159` の
   * `generateProjectId(workspacePath)`）であって `workflowRootPath` ではない。本家はこの2つを
   * 別概念として持ち、`SPEC_WORKFLOW_SHARED_ROOT` の下では複数の workspace が1つの
   * `workflowRootPath` を共有する。
   *
   * 呼び出し側は `ProjectSummary.workflowRootPath` を渡しているが、**承認で作ったものは
   * cwd がそのまま `<projectShareRoot>/<name>` なので両者が一致する**——それがこの導出の
   * 成り立つ条件である。共有ルートや外から置かれたプロジェクトでは一致せず、導出値は本家の
   * id と合わない（design.md D13）。
   */
  workspacePath: string,
): string {
  return createHash('sha1').update(resolve(workspacePath)).digest('base64url').substring(0, 16);
}
