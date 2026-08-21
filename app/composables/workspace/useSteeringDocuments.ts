/**
 * 本家のステアリングは常に product / tech / structure の3本で、一覧 API が無い。
 * 有無は `info` の `steering.documents` から組み立てる。
 *
 * 一覧画面と本文画面の両方が同じ組み立てを要るので、ここに置く。
 */

import { computed, type ComputedRef, type Ref } from 'vue';

export const STEERING_DOCUMENTS = [
  { name: 'product', label: 'product.md' },
  { name: 'tech', label: 'tech.md' },
  { name: 'structure', label: 'structure.md' },
] as const;

export type SteeringName = (typeof STEERING_DOCUMENTS)[number]['name'];

export interface SteeringEntry {
  name: SteeringName;
  label: string;
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
