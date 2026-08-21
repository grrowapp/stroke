// auto-import を使わないため `#imports` から明示的に取る（structure.md の Import Patterns）。
import { defineAppConfig } from '#imports';

export default defineAppConfig({
  ui: {
    colors: {
      // 本家のアクセントは indigo 1色に集約されており、種別ごとに色を撒かない。
      // 例外はトーストだけで、そこは Nuxt UI の success / info / warning / error を使う。
      primary: 'indigo',
      neutral: 'slate',
    },
  },
});
