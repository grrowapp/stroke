/**
 * PROTOTYPE — throwaway. `adr0017-sub-full-width-markdown-editor` の ui.md 用。
 *
 * 挙動はユーザー指定で固定。3案が変えるのは「つまみに何を残すか」と「開閉の口をどこに置くか」だけ。
 *
 *   1. 左のメニューバーと右の指摘の一覧は**連動しない**。左を閉じても右は出たまま
 *   2. 左の状態に関わらず、右をワンクリックで右へスライドしてしまえる。
 *      このとき左が閉じていたら開く。開いていたら何もしない
 *   3. しまった右は、つまみ幅だけ画面に残す。つまみをワンクリックすると右だけ戻る
 */
import { computed, useCookie, useRoute, useState } from '#imports';

export type PrototypeVariant = 'a' | 'b' | 'c';

export const PROTOTYPE_VARIANTS: readonly PrototypeVariant[] = ['a', 'b', 'c'] as const;

export const PROTOTYPE_VARIANT_NAMES: Record<PrototypeVariant, string> = {
  a: '縦書きの帯を残す',
  b: '同じ場所で開閉するつまみ',
  c: '見出しを細くして残す',
};

export function usePrototypePanels() {
  const route = useRoute();

  const variant = computed<PrototypeVariant>(() => {
    const raw = String(route.query.variant ?? 'a').toLowerCase();
    return PROTOTYPE_VARIANTS.includes(raw as PrototypeVariant) ? (raw as PrototypeVariant) : 'a';
  });

  /** 左のメニューバー。既存の畳みと同じ cookie（別の状態を増やさない） */
  const collapsedStore = useCookie<boolean>('spec-workflow-sidebar-collapsed', {
    default: () => false,
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });

  /*
   * `useCookie` は呼び出しごとに別の ref を返す。layout と承認画面で別々に呼ぶと、
   * 片方で書き換えてももう片方に伝わらない。共有の `useState` を正にして、
   * cookie は書き出し先としてだけ使う。
   */
  const leftState = useState<boolean>(
    'prototype-left-collapsed',
    () => collapsedStore.value === true,
  );

  const leftCollapsed = computed(() => leftState.value);

  function setLeft(next: boolean): void {
    leftState.value = next;
    collapsedStore.value = next;
  }

  /** 右の指摘の一覧が右端へ引っ込んでいるか。持続させない */
  const rightTucked = useState<boolean>('prototype-right-tucked', () => false);

  /** 左の開閉。フル → 閉じる にしたタイミングで、右も右端へしまう */
  function toggleLeft(): void {
    const next = !leftCollapsed.value;
    setLeft(next);
    if (next) rightTucked.value = true;
  }

  /** 右をしまう。左には触らない（追従動作は指示されていない） */
  function tuckRight(): void {
    rightTucked.value = true;
  }

  /** つまみから右だけ戻す。左には触らない */
  function untuckRight(): void {
    rightTucked.value = false;
  }

  return { variant, leftCollapsed, rightTucked, toggleLeft, tuckRight, untuckRight };
}
