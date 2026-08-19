<script setup lang="ts">
// プロトタイプ用の切り替えバー。評価対象のデザインではないので、わざと浮かせて置く。
const props = withDefaults(
  defineProps<{
    variants: string[]
    names: Record<string, string>
    current: string
    state: unknown
    param?: string
  }>(),
  { param: 'variant' },
)

const router = useRouter()
const route = useRoute()

function go(step: number) {
  const i = props.variants.indexOf(props.current)
  const next = props.variants[(i + step + props.variants.length) % props.variants.length]
  router.replace({ query: { ...route.query, [props.param]: next } })
}

function onKey(e: KeyboardEvent) {
  const el = document.activeElement
  const tag = el?.tagName.toLowerCase()
  if (tag === 'input' || tag === 'textarea' || (el as HTMLElement | null)?.isContentEditable) return
  if (e.key === 'ArrowLeft') go(-1)
  if (e.key === 'ArrowRight') go(1)
}

onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
    <div class="flex max-w-full items-center gap-3 rounded-full bg-black px-3 py-2 text-white shadow-xl ring-1 ring-white/20">
      <button class="rounded-full px-3 py-1 hover:bg-white/15" @click="go(-1)">‹</button>
      <span class="whitespace-nowrap text-sm font-medium">
        {{ current }} — {{ names[current] }}
      </span>
      <button class="rounded-full px-3 py-1 hover:bg-white/15" @click="go(1)">›</button>
      <span class="flex items-center gap-1 border-l border-white/25 pl-3 text-xs">
        <NuxtLink
          to="/"
          class="rounded-full px-2 py-1"
          :class="route.path === '/' ? 'bg-white/20' : 'text-white/60 hover:bg-white/10'"
        >画面1</NuxtLink>
        <NuxtLink
          to="/proposal"
          class="rounded-full px-2 py-1"
          :class="route.path === '/proposal' ? 'bg-white/20' : 'text-white/60 hover:bg-white/10'"
        >画面2</NuxtLink>
        <a href="/" class="rounded-full px-2 py-1 text-white/60 hover:bg-white/10">最初から</a>
      </span>
      <span class="hidden max-w-xs truncate border-l border-white/25 pl-3 text-xs text-white/70 lg:inline">
        {{ state ? JSON.stringify(state) : '（未回答）' }}
      </span>
    </div>
  </div>
</template>
