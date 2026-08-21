<script setup lang="ts">
/**
 * 下層 — 仕様書。一覧と各フェーズの有無を出すだけ。編集も承認も置かない。
 */
import { computed, definePageMeta, useFetch, useRoute } from '#imports';

definePageMeta({ layout: 'workspace' });

const route = useRoute();
const projectId = computed(() => String(route.params.projectId ?? ''));

const { data, error } = await useFetch(() => `/api/projects/${projectId.value}/specs`);
const specs = computed(() => data.value ?? []);

/** 各フェーズの有無。無いものは無彩色で示す（ui.md の Visual Language） */
function phases(spec: (typeof specs.value)[number]) {
  return [
    { label: '要件', exists: spec.phases.requirements.exists },
    { label: '設計', exists: spec.phases.design.exists },
    { label: 'タスク', exists: spec.phases.tasks.exists },
  ];
}
</script>

<template>
  <section>
    <h1 class="mb-3 text-lg font-semibold">仕様書</h1>

    <p v-if="error" class="sb-placeholder" data-testid="specs-error">
      仕様書を取得できませんでした。本家に繋がっていない可能性があります。
    </p>
    <p v-else-if="specs.length === 0" class="sb-placeholder" data-testid="specs-empty">
      仕様書がまだありません。
    </p>
    <table v-else class="sb-table" data-testid="specs-list">
      <thead>
        <tr>
          <th scope="col">仕様書</th>
          <th scope="col" class="w-64">フェーズ</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="spec in specs" :key="spec.name" data-testid="spec-row">
          <td>{{ spec.name }}</td>
          <td>
            <span class="flex gap-1.5">
              <span
                v-for="phase in phases(spec)"
                :key="phase.label"
                class="sb-chip"
                :style="phase.exists ? undefined : { opacity: 0.45 }"
              >
                {{ phase.label }}{{ phase.exists ? '' : '（未）' }}
              </span>
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
