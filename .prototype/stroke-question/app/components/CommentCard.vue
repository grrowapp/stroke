<script setup lang="ts">
// コメント1件のカード。spec-workflow-mcp のコメントカードに合わせる。
import type { Annotation } from '~/composables/useAnnotations'

defineProps<{ comment: Annotation }>()
const emit = defineEmits<{ edit: [id: string]; remove: [id: string] }>()
</script>

<template>
  <div class="overflow-hidden rounded-lg border border-default bg-default">
    <div class="flex items-center justify-between border-b border-default bg-elevated/60 px-3 py-2">
      <div class="flex items-center gap-2">
        <span
          v-if="comment.type === 'selection'"
          class="h-2.5 w-2.5 rounded-full border"
          :style="{ backgroundColor: comment.highlightColor?.bg, borderColor: comment.highlightColor?.border }"
        />
        <span class="text-[11px] font-medium uppercase tracking-wide text-muted">
          {{ comment.type === 'selection' ? '本文へのコメント' : '全体へのコメント' }}
        </span>
      </div>
      <div class="flex items-center gap-1">
        <button
          v-if="comment.type === 'selection'"
          class="rounded px-1.5 py-1 text-xs text-muted hover:text-primary"
          title="直す"
          @click="emit('edit', comment.id)"
        >直す</button>
        <button
          class="rounded px-1.5 py-1 text-xs text-muted hover:text-error"
          title="消す"
          @click="emit('remove', comment.id)"
        >消す</button>
      </div>
    </div>

    <div class="space-y-3 p-3">
      <div class="flex items-center gap-1.5">
        <span class="text-[10px] uppercase tracking-wide text-muted">ID</span>
        <code class="rounded bg-elevated px-1.5 py-0.5 font-mono text-[11px] text-muted">{{ comment.id }}</code>
      </div>

      <pre
        v-if="comment.selectedText"
        class="m-0 whitespace-pre-wrap break-words rounded-lg border p-2.5 font-mono text-xs leading-relaxed"
        :style="{ backgroundColor: comment.highlightColor?.bg, borderColor: comment.highlightColor?.border }"
      >{{ comment.selectedText }}</pre>

      <p class="text-sm leading-relaxed">{{ comment.comment }}</p>
    </div>
  </div>
</template>
