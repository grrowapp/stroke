<script setup lang="ts">
// コメント1件のカード。種別・色・ID・引用の全文・コメント本文を持ち、編集 / 消すの口を備える。
import type { Annotation } from '#shared/types'

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
          :style="{
            backgroundColor: comment.highlightColor.bg,
            borderColor: comment.highlightColor.border,
          }"
        />
        <span class="text-[11px] font-medium tracking-wide text-muted">
          {{ comment.type === 'selection' ? '本文へのコメント' : '全体へのコメント' }}
        </span>
      </div>
      <div class="flex items-center gap-1">
        <button
          type="button"
          class="rounded px-1.5 py-1 text-xs text-muted hover:text-primary"
          @click="emit('edit', comment.id)"
        >編集</button>
        <button
          type="button"
          class="rounded px-1.5 py-1 text-xs text-muted hover:text-error"
          @click="emit('remove', comment.id)"
        >消す</button>
      </div>
    </div>

    <div class="space-y-3 p-3">
      <div class="flex items-center gap-1.5">
        <span class="text-[10px] tracking-wide text-muted">ID</span>
        <code class="rounded bg-elevated px-1.5 py-0.5 font-mono text-[11px] text-muted">{{ comment.id }}</code>
      </div>

      <pre
        v-if="comment.type === 'selection'"
        class="m-0 whitespace-pre-wrap break-words rounded-lg border p-2.5 font-mono text-xs leading-relaxed"
        :style="{
          backgroundColor: comment.highlightColor.bg,
          borderColor: comment.highlightColor.border,
        }"
      >{{ comment.selectedText }}</pre>

      <p class="text-sm leading-relaxed">{{ comment.comment }}</p>
    </div>
  </div>
</template>
