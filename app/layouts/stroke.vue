<script setup lang="ts">
/**
 * ストロークの器。
 *
 * 一覧の作成ボタンから入った先を、オーバーレイ上のモーダルとして画面全体に出す
 * （ADR 0009・0010、design.md D1）。中身と流れは変えない——器だけを与える。
 *
 * - `fullscreen` — 画面全体を占める
 * - `dismissible: false` + `close: false` — 閉じる操作を持たない。Esc も背景クリックも
 *   効かず、×ボタンも出さない。ストロークは最後まで行く（途中で閉じる道を作らない）
 * - `open` は固定で true — 開閉の状態を持たない。**どの場面に居るかは URL が持つ**ので、
 *   リロードすれば同じ途中画面がモーダルとして開き直る（design.md D1）
 *
 * 開閉状態を component 側に持つと、セッション id の保存先を URL とは別に持つことになり
 * 二重化する。だから持たない。
 */
</script>

<template>
  <UModal
    open
    fullscreen
    :dismissible="false"
    :close="false"
    :ui="{ content: 'overflow-y-auto' }"
  >
    <!--
      `data-testid` は `#content` の中に置く。UModal のルート属性はテレポートされる
      DialogContent へ伝播しないため（実測: 属性が DOM に出ない）。
    -->
    <template #content>
      <div data-testid="stroke-modal" class="h-full">
        <slot />
      </div>
    </template>
  </UModal>
</template>
