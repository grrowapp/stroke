<script setup lang="ts">
/** 下層 — 仕様書の一覧。各行は仕様書ごとの URL を持つ */
import { computed, definePageMeta } from '#imports';

import EmptyState from '~/components/workspace/EmptyState.vue';
import RecordList from '~/components/workspace/RecordList.vue';
import { useProjectId, useSpecs } from '~/composables/useProjectApi';

definePageMeta({ layout: 'workspace' });

const projectId = useProjectId();
const { data, error } = await useSpecs(projectId);

const items = computed(() =>
  (data.value ?? []).map((spec) => ({
    key: spec.name,
    label: spec.name,
    detail: spec.description,
    to: `/projects/${projectId.value}/specs/${spec.name}`,
  })),
);
</script>

<template>
  <section>
    <h1 class="sb-page-title">仕様書</h1>

    <EmptyState v-if="error" testid="specs-error">
      仕様書を取得できませんでした。本家に繋がっていない可能性があります。
    </EmptyState>
    <EmptyState v-else-if="items.length === 0" testid="specs-empty">
      仕様書がまだありません。
    </EmptyState>
    <RecordList v-else :items="items" testid="specs-list" />
  </section>
</template>
