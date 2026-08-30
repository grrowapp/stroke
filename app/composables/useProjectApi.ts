/**
 * 下層の画面が本家の情報を取るための唯一の口。
 *
 * 画面ごとに `useFetch` の URL を書くと、エンドポイントの形が画面の数だけ散る。ここに
 * 集めておけば、本家の形が変わったときに直す場所が1つで済む（structure.md の
 * 「本家に触るコードは接点に閉じる」を画面側にも通す）。
 *
 * 取得先はすべて stroke-board のサーバー。ブラウザから本家へは触らない。
 * 返す形は `#shared/types` の Dto に固定する。関数 URL を渡すと推論が効かないため、
 * ここで明示しておかないと画面側が any になる。
 */

import { $fetch, useFetch, useRoute } from '#imports';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';

import type {
  ApprovalActionName,
  ApprovalDto,
  ApprovalRevisionPayload,
  DocumentContentDto,
  ProjectInfoDto,
  SpecDocumentsDto,
  SpecSummaryDto,
  TaskProgressDto,
} from '#shared/types';

/** URL の `[projectId]` を取る。下層の画面はすべてこの配下にある */
export function useProjectId() {
  const route = useRoute();
  return computed(() => String(route.params.projectId ?? ''));
}

function base(projectId: MaybeRefOrGetter<string>): string {
  return `/api/projects/${toValue(projectId)}`;
}

/** プロジェクトの基本情報。ステアリング3本の有無もここに入っている */
export function useProjectInfo(projectId: MaybeRefOrGetter<string>) {
  return useFetch<ProjectInfoDto>(() => `${base(projectId)}/info`);
}

/** 仕様書の一覧 */
export function useSpecs(projectId: MaybeRefOrGetter<string>) {
  return useFetch<SpecSummaryDto[]>(() => `${base(projectId)}/specs`);
}

/** 仕様書1本の requirements / design / tasks。無い文書は null で返る */
export function useSpecDocuments(
  projectId: MaybeRefOrGetter<string>,
  specName: MaybeRefOrGetter<string>,
) {
  return useFetch<SpecDocumentsDto>(() => `${base(projectId)}/specs/${toValue(specName)}/documents`);
}

/** 仕様書1本のタスク進捗 */
export function useTaskProgress(
  projectId: MaybeRefOrGetter<string>,
  specName: MaybeRefOrGetter<string>,
) {
  return useFetch<TaskProgressDto>(() => `${base(projectId)}/specs/${toValue(specName)}/tasks`);
}

/** ステアリング文書の本文 */
export function useSteeringDocument(
  projectId: MaybeRefOrGetter<string>,
  name: MaybeRefOrGetter<string>,
) {
  return useFetch<DocumentContentDto>(() => `${base(projectId)}/steering/${toValue(name)}`);
}

/**
 * 保留中の承認依頼を数えるためのキー。
 *
 * 承認一覧と承認詳細の両方がこの composable を呼ぶ。キーを自動生成に任せると
 * **呼び出し位置（この関数の中の1箇所）から作られるため両ページで同じ値になり**、
 * 詳細ページで取ったものを一覧ページがそのまま使い回して再取得しない（実測）。
 * 共有すること自体は正しい（同じデータなので）が、**応答を送った後に捨てる口**が要る。
 * その口が `refreshNuxtData(pendingApprovalsKey(projectId))`。
 */
export function pendingApprovalsKey(projectId: MaybeRefOrGetter<string>): string {
  return `approvals:${toValue(projectId)}`;
}

/** 保留中の承認依頼。本家は保留中しか返さない */
export function usePendingApprovals(projectId: MaybeRefOrGetter<string>) {
  return useFetch<ApprovalDto[]>(() => `${base(projectId)}/approvals`, {
    key: () => pendingApprovalsKey(projectId),
  });
}

/** 承認依頼の対象文書の中身 */
export function useApprovalContent(
  projectId: MaybeRefOrGetter<string>,
  approvalId: MaybeRefOrGetter<string>,
) {
  return useFetch<DocumentContentDto>(
    () => `${base(projectId)}/approvals/${toValue(approvalId)}/content`,
  );
}

// --- 保存 ---

/**
 * 保存は取得と違い、画面の操作に対して1回だけ走る。`useFetch` は URL に紐づいて
 * 追従するもので、押したときに送る用途には合わないので `$fetch` を直に使う。
 *
 * 失敗は理由の文字列で返す。画面はそれをそのまま出す。何が起きたかによって
 * 見せ方を変えたいので、握り潰して真偽値にしない（specs/document-editing）。
 */
async function put(path: string, content: string): Promise<string | null> {
  try {
    await $fetch(path, { method: 'PUT', body: { content } });
    return null;
  } catch (error) {
    return reasonOf(error);
  }
}

/** 仕様書の文書を保存する */
export function saveSpecDocument(
  projectId: string,
  specName: string,
  document: string,
  content: string,
): Promise<string | null> {
  return put(`/api/projects/${projectId}/specs/${specName}/${document}`, content);
}

/** ステアリング文書を保存する */
export function saveSteeringDocument(
  projectId: string,
  name: string,
  content: string,
): Promise<string | null> {
  return put(`/api/projects/${projectId}/steering/${name}`, content);
}

// --- 承認への応答 ---

/**
 * 承認への応答を送る。失敗した理由の文字列を返す。成功なら null。
 *
 * 本家が受ける3つ（`approve` / `reject` / `needs-revision`）をそのまま出す。注釈を
 * 運べるのは `needs-revision` だけで、`approve` / `reject` は `response` しか持たない
 * （サーバー側でも弾く）。
 */
/**
 * 保留中の承認依頼を**一度だけ**取る。
 *
 * `useProjectApprovals` は画面に貼り付ける取得（`useFetch`）で、決着のモーダルのように
 * 「今この瞬間に1件引きたい」場面には向かない。同じ URL を画面に書かせないためにここに置く。
 */
export async function fetchPendingApprovals(projectId: string): Promise<ApprovalDto[]> {
  return $fetch<ApprovalDto[]>(`${base(projectId)}/approvals`);
}

/**
 * プロジェクトを消す（`openspec/specs/api/project/delete`）。失敗したら理由の文字列、成功なら null。
 *
 * メソッドで振り分ける。パスに動詞を置かない（design.md D11）。
 */
export async function deleteProject(projectId: string): Promise<string | null> {
  try {
    await $fetch(`${base(projectId)}`, { method: 'DELETE' });
    return null;
  } catch (error) {
    return approvalReasonOf(error);
  }
}

/**
 * ステアリングを起こし直す（U13）。失敗したら理由の文字列、成功なら null。
 *
 * **`cwd` を必ず渡す。** `docs/specs/api/contract.md` の U13 が「endpoint は cwd を自分で
 * 導出しない——キックする側が path を渡す」と定めている。昇格後の対象は保存先直下の
 * プロジェクト名なので、行が持つ path をそのまま渡す。
 *
 * `reset=1` はリトライ回数を戻す。上限に達して終端の失敗になっているため、戻さないと
 * 起こしてもすぐ諦める（openspec/specs/agent/invocation「ユーザーが再実行する」）。
 */
export async function restartSteering(name: string, cwd: string): Promise<string | null> {
  try {
    await $fetch(`/api/strokes/${encodeURIComponent(name)}/invoke-agent`, {
      query: { reset: 1, cwd },
    });
    return null;
  } catch (error) {
    return approvalReasonOf(error);
  }
}

export async function respondToApproval(
  projectId: string,
  approvalId: string,
  action: ApprovalActionName,
  body: { response?: string } | ApprovalRevisionPayload,
): Promise<string | null> {
  try {
    await $fetch(`/api/projects/${projectId}/approvals/${approvalId}/${action}`, {
      method: 'POST',
      body,
    });
    return null;
  } catch (error) {
    return approvalReasonOf(error);
  }
}

/**
 * 承認への応答が通らなかった理由を、画面に出せる言葉にする。
 *
 * 保存（`reasonOf`）と混ぜないのは、同じ `statusMessage` でも意味が違うため。
 * 「見つからない」は保存では文書、承認では承認依頼そのものを指す。
 */
function approvalReasonOf(error: unknown): string {
  const status = (error as { statusMessage?: string } | null)?.statusMessage;

  switch (status) {
    case 'upstream-not-configured':
      return '本家ダッシュボードの URL が設定されていません。';
    case 'upstream-unreachable':
      return '本家に繋がりません。本家が動いているか確かめてください。';
    case 'upstream-not-found':
      return 'この承認依頼が本家に見つかりません。既に処理済みの可能性があります。';
    case 'revision-needs-comments':
      return 'コメントが1件もありません。差し戻すにはコメントが要ります。';
    case 'reject-needs-reason':
      return '却下の理由が要ります。';
    case 'annotations-need-revision':
      return 'コメントを運べるのは差し戻しだけです。';
    case 'invalid-body':
      return '送る内容の形が正しくありません。';
    default:
      return '送れませんでした。もう一度試してください。';
  }
}

/**
 * 承認依頼の `filePath` から、その文書の保存先を導く。
 *
 * 承認で開いた文書は、仕様書やステアリングの画面で開くものと同じ実体である。
 * 承認の文脈で読んで直したくなったときに、別の画面へ移り直させない
 * （specs/document-editing）。
 *
 * `filePath` はプロジェクトルートからの相対パスで、次の2つの形しか来ない。
 *
 *   .spec-workflow/steering/<name>.md
 *   .spec-workflow/specs/<specName>/<document>.md
 *
 * 上記に当てはまらないもの、または編集を許していない文書名のものは `null` を返す。
 * その場合は読むだけになる。
 */
export function saveTargetOf(
  filePath: string,
): { save: (projectId: string, content: string) => Promise<string | null> } | null {
  const steering = /^\.spec-workflow\/steering\/([^/]+)\.md$/.exec(filePath);
  if (steering !== null) {
    const name = steering[1]!;
    if (!STEERING_DOCUMENTS.includes(name)) return null;
    return { save: (projectId, content) => saveSteeringDocument(projectId, name, content) };
  }

  const spec = /^\.spec-workflow\/specs\/([^/]+)\/([^/]+)\.md$/.exec(filePath);
  if (spec !== null) {
    const specName = spec[1]!;
    const document = spec[2]!;
    if (!SPEC_DOCUMENTS.includes(document)) return null;
    return {
      save: (projectId, content) => saveSpecDocument(projectId, specName, document, content),
    };
  }

  return null;
}

/**
 * 編集を許す文書名。サーバー側（`upstream/schema.ts` と `upstream/rest.ts`）が持つものと
 * 同じ値を、画面側でも持つ。ここは「編集の口を出すかどうか」の判断に使う。
 * 実際に保存を通すかどうかはサーバーが決める。
 */
const STEERING_DOCUMENTS: readonly string[] = ['product', 'tech', 'structure'];
const SPEC_DOCUMENTS: readonly string[] = ['requirements', 'design', 'tasks'];

/**
 * 失敗の理由を画面に出せる言葉にする。
 *
 * サーバーは `statusMessage` に何が起きたかを入れて返す（`upstream-proxy.ts` の
 * `toHttpError`）。本家が止まっているのか、送った内容が悪いのかで直し方が違うので、
 * 「保存に失敗しました」だけにまとめない。
 */
function reasonOf(error: unknown): string {
  const status = (error as { statusMessage?: string } | null)?.statusMessage;

  switch (status) {
    case 'upstream-not-configured':
      return '本家ダッシュボードの URL が設定されていません。';
    case 'upstream-unreachable':
      return '本家に繋がりません。本家が動いているか確かめてください。';
    case 'upstream-not-found':
      return 'この文書が本家に見つかりません。削除されたか、名前が変わった可能性があります。';
    case 'unknown-spec-document':
    case 'unknown-steering-document':
      return 'この文書は編集できません。';
    case 'invalid-body':
      return '送る内容の形が正しくありません。';
    default:
      return '保存できませんでした。もう一度試してください。';
  }
}
