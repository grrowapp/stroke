// auto-import を使わないため `#imports` から明示的に取る（structure.md の Import Patterns）。
import { defineAppConfig } from '#imports';

export default defineAppConfig({
  /**
   * 完全な失敗の後に出す「人へ引き渡す」の行き先
   * （`docs/specs/architecture/failure.md`「対処の選択肢」）。
   *
   * **既定は空で、空のあいだはその選択肢を出さない。** 行き先の無い問い合わせ先を出すと、
   * ユーザーは押しても何も起きない道を1つ増やされるだけになる。運用で値を入れたときに
   * 初めて現れる。
   */
  support: {
    /** 問い合わせ先。`mailto:` でも URL でもよい。空なら出さない */
    contact: '',
    /** ボタンに出す文言。既定は「管理者に問い合わせる」 */
    label: '管理者に問い合わせる',
  },
  ui: {
    colors: {
      // 本家のアクセントは indigo 1色に集約されており、種別ごとに色を撒かない。
      // 例外はトーストだけで、そこは Nuxt UI の success / info / warning / error を使う。
      primary: 'indigo',
      neutral: 'slate',
    },
  },
});
