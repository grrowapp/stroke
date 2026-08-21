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
</script>

<template>
  <section>
    <h1 class="mb-4 text-lg font-semibold text-highlighted">仕様書</h1>

    <p v-if="error" class="text-muted" data-testid="specs-error">
      仕様書を取得できませんでした。本家に繋がっていない可能性があります。
    </p>
    <p v-else-if="specs.length === 0" class="text-muted" data-testid="specs-empty">
      仕様書がまだありません。
    </p>
    <ul v-else class="space-y-2" data-testid="specs-list">
      <li
        v-for="spec in specs"
        :key="spec.name"
        class="rounded border border-default px-3 py-2"
        data-testid="spec-row"
      >
        <div class="text-highlighted">{{ spec.name }}</div>
        <div class="text-sm text-muted">
          要件 {{ spec.phases.requirements.exists ? '有' : '無' }} /
          設計 {{ spec.phases.design.exists ? '有' : '無' }} /
          タスク {{ spec.phases.tasks.exists ? '有' : '無' }}
        </div>
      </li>
    </ul>
  </section>
</template>
