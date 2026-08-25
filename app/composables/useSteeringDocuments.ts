/**
 * 本家のステアリングは常に product / tech / structure の3本で、一覧 API が無い。
 * 有無は `info` の `steering.documents` から組み立てる。
 *
 * 一覧画面と本文画面の両方が同じ組み立てを要るので、ここに置く。
 */

import { computed, type ComputedRef, type Ref } from 'vue';

/**
 * 本家は行の1列目を2段で出す。上段が表示名、下段がファイル名
 * （`SteeringPage.tsx` の `SteeringDocumentRow`）。
 *
 * 表示名は本家が `displayName` に直接書いており、i18n を通していない。日本語表示でも
 * Product / Technical / Structure のまま出るので、ここも訳さない。
 */
export const STEERING_DOCUMENTS = [
  { name: 'product', label: 'Product', file: 'product.md' },
  { name: 'tech', label: 'Technical', file: 'tech.md' },
  { name: 'structure', label: 'Structure', file: 'structure.md' },
] as const;

export type SteeringName = (typeof STEERING_DOCUMENTS)[number]['name'];

export interface SteeringEntry {
  name: SteeringName;
  label: string;
  /** 行の下段に出すファイル名。本家の `{name}.md` */
  file: string;
  exists: boolean;
}

interface SteeringPresence {
  steering: { documents: Record<SteeringName, boolean> };
}

export function useSteeringEntries(
  info: Ref<SteeringPresence | null | undefined>,
): ComputedRef<SteeringEntry[]> {
  return computed(() =>
    STEERING_DOCUMENTS.map((document) => ({
      ...document,
      exists: info.value?.steering.documents[document.name] ?? false,
    })),
  );
}

export function isSteeringName(value: string): value is SteeringName {
  return STEERING_DOCUMENTS.some((document) => document.name === value);
}
