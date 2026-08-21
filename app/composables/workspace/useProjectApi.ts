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

import { useFetch, useRoute } from '#imports';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';

import type {
  ApprovalDto,
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

/** 保留中の承認依頼。本家は保留中しか返さない */
export function usePendingApprovals(projectId: MaybeRefOrGetter<string>) {
  return useFetch<ApprovalDto[]>(() => `${base(projectId)}/approvals`);
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
