# markxdown

markdown を描く・直す・位置を出す、を `@nuxt/ui` の上で提供する Nuxt module。
package 名は `@grrowapp/markxdown`、module 名と `configKey` はどちらも `markxdown`。

外へ公開しているのは `#markdown` alias 1本で、そこから引けるのは次の4つ。

| 名前 | 何をするもの |
|---|---|
| `render/MarkdownView.vue` | markdown を整形して描く面。位置の対応を出す |
| `render/MarkdownSource.vue` | 生テキストをそのまま出す面。位置の対応を出す |
| `edit/MarkdownEditor.vue` | 文書を直す面。生テキストの入力と、整形した本文の確認 |
| `position/types.ts` | 位置の対応の型（`SourceRange` / `PositionPort`） |

## この資料の扱い

**ここに書くのは使い方だけ。** 引数・返り値・依存する境界・設置の手順・呼び出し例に限る。

**振る舞いの規定は書かない。** 位置を何の先頭から数えるか、面が正規化の食い違いを自分で吸収すること、
図に生テキストを添える条件、公開するものを絞ることといった規定の本体は
`openspec/specs/markdown/module/spec.md` にある。食い違ったときは spec が勝つ。

module がリポジトリの外の package へ移ることに伴う規定（module の並び・CSS の取り込み・
既定値だけで使えること）は、change `remove-module-markdown` の delta が持つ。所在は「関連」に置く。

## `MarkdownView`

### 何を持つか

```vue
<MarkdownView ref="previewSurface" :value="content" :source-shown="sourceShown" />
```

| props | 内容 |
|---|---|
| `value` | 描く markdown の生テキスト。`string \| null \| undefined` |
| `testid` | E2E の掴み所。既定 `'document-content'` |
| `surface` | 本文を一段暗い矩形の面に載せる。既定 `true`。自前の余白を持つレイアウトでは `false` |
| `source-shown` | 図のもとになった生テキストを添えたい範囲の並び（`readonly SourceRange[]`）。既定は空 |

必須は `value` だけ。残る3つは既定値を持つ。

| slot | 内容 |
|---|---|
| `#empty` | `value` が空のときに出すもの。呼ぶ側が渡す |

emit は無い。

| expose | 内容 |
|---|---|
| `toSourceRange(range: Range)` | DOM の選択範囲 → 生テキストの位置。取れなければ `null` |
| `toDomRange(source: SourceRange)` | 生テキストの位置 → DOM の範囲。取れなければ `null` |

expose は `PositionPort` そのものの形で出る。`useTemplateRef` で受けた面を
`PositionPort` として扱えばよい。

`class` は呼ぶ側から足せる（`inheritAttrs: false` + `v-bind="$attrs"`）。余白など、置かれる場所の
都合を足すためのもの。

### 何に依存するか

`@nuxt/ui` の Prose と `@nuxtjs/mdc`。どちらへ渡す設定も module の中に閉じているので、呼ぶ側は設定を書かない。
`@nuxt/ui` そのものは peerDependency で、利用側が用意する。サーバとの境界は持たない。`value` に渡す文字列を取ってくるのは呼ぶ側の責務。

### どこから呼ばれるか

- `app/pages/strokes/[sessionId]/proposal.vue` — プレビューの面。`:surface="false"` で自前の余白に載せる
- `app/pages/projects/[projectId]/approvals/[approvalId].vue` — 承認対象の本文。`#empty` を渡す

### 呼び出し例

下の「設置の手順」を見ること。

## `MarkdownSource`

### 何を持つか

```vue
<MarkdownSource ref="sourceSurface" :value="source" />
```

| props | 内容 |
|---|---|
| `value` | 出す生テキスト。`string \| null \| undefined` |
| `testid` | E2E の掴み所。既定 `'document-source'` |
| `surface` | 箱の余白を載せる。既定 `true` |

| slot | 内容 |
|---|---|
| `#empty` | `value` が空のときに出すもの |

emit は無い。expose は `MarkdownView` と同じ2つ（`toSourceRange` / `toDomRange`）。
**面が違っても出し方は同じ**なので、使う側はどちらの面かで分岐しない。

### 何に依存するか

無い。渡された文字列をそのまま並べるだけで、markdown の解釈を通らない。

### どこから呼ばれるか

- `app/pages/strokes/[sessionId]/proposal.vue` — 生テキストの面
- `app/components/review/ApprovalAnnotator.vue` — 注釈の面に載せる生テキスト

### 呼び出し例

下の「設置の手順」を見ること。

## `MarkdownEditor`

### 何を持つか

```vue
<MarkdownEditor :content="data?.content" :save="save" :can-save="upstreamConnected" testid="steering-document" />
```

| props | 内容 |
|---|---|
| `content` | 保存されている内容。`null` は未作成 |
| `save` | 保存する関数。`(content: string) => Promise<string \| null>`。失敗した理由を返し、成功なら `null` |
| `can-save` | 保存できる状態か。`false` のあいだは保存できない旨を面が出す |
| `edit-on-open` | 開いた時点で編集に入る |
| `framed` | 本文を枠付きの箱に入れる。既定は枠なし |
| `testid` | E2E の掴み所 |

必須は `content` と `save` の2つ。

| slot | 内容 |
|---|---|
| `#empty` | 中身が無いときに出すもの。中の `MarkdownView` へ素通しする |

emit は無い。expose も無い。保存の実行は `save` を呼ぶ形で行き、結果は返り値で返る。

### 何に依存するか

内部で `MarkdownView` と `@nuxt/ui` の部品（`UButton` / `UTextarea`）を使う。保存先の決定と
保存の実行は持たないので、サーバとの境界は `save` を渡す側にある。`vue-router` の
`onBeforeRouteLeave` を使うため、router のあるアプリで使う。

### どこから呼ばれるか

- `app/pages/projects/[projectId]/steering/[name].vue`
- `app/pages/projects/[projectId]/specs/[specName]/[document].vue`

承認の画面は使わない（読むだけの画面なので `MarkdownView` を置く）。

### 呼び出し例

下の「設置の手順」を見ること。

## 位置の対応

型は `#markdown/position/types` から引く。

```ts
import type { PositionPort, SourceRange } from '#markdown/position/types';
```

| 名前 | 内容 |
|---|---|
| `SourceRange` | 生テキストの範囲。`{ start: number; end: number }`。`start` は含み、`end` は含まない |
| `PositionPort` | 面が実装する2つのメソッド（`toSourceRange` / `toDomRange`）の型 |

面から引くときは `ref` で受ける。`MarkdownView` と `MarkdownSource` のどちらも同じ形で名乗るので、
受け取った側は面の違いを見ない。

```ts
const previewSurface = useTemplateRef<InstanceType<typeof MarkdownView>>('previewSurface');
const sourceSurface = useTemplateRef<InstanceType<typeof MarkdownSource>>('sourceSurface');
```

両方向とも、対応が取れないときは `null` が返る。中身が空のあいだ、および markdown の解析が
終わる前も `null` になる。

`source-shown` に渡す範囲も同じ `SourceRange` で、基準は面に渡した文字列である。
module は範囲が何を意味するか（注釈なのか検索の当たりなのか）を知らない。

型だけを引いているのは `app/components/review/AnnotateSource.vue` と
`app/composables/useAnnotationHighlight.ts` の2つ。面そのものは置かず、`PositionPort` を受け取って使う。

## 設置の手順

### 1. 依存に入れる

`package.json` に `@grrowapp/markxdown` を足す。

**引く形（npm / ファイル参照 / git 参照）は未決。** change `remove-module-markdown` の tasks で決める。
決まるまでは `package.json` の書き方だけが定まらない。以下の手順は引く形に依存しない。

`@nuxt/ui`・`vue`・`vue-router` は peerDependency で、利用側が用意する。

### 2. `nuxt.config.ts` の `modules` に並べる

**`@nuxt/ui` より前に置く。**

```ts
export default defineNuxtConfig({
  modules: ['@grrowapp/markxdown', '@nuxt/ui'],
});
```

`@nuxt/ui` は自分の setup の時点で `@nuxtjs/mdc` が入っているかを見て Prose 一式を登録するため、
後ろに置くと Prose が登録されない。

並びが逆でもアプリは落ちず、本文の見た目だけが失われる。

### 3. `main.css` で取り込む

`@import "@nuxt/ui";` の後に1行足す。

```css
@import "tailwindcss";
@import "@nuxt/ui";
@import "@grrowapp/markxdown";
```

CSS のクラスを生成するための走査の指定は package 側が持つ。利用側が module の中を指す path を
書く必要は無い。

### 4. 設定は書かない

stroke-board は既定値だけで使い、`nuxt.config.ts` に `markxdown` キーを置かない。
そのため `docs/specs/core/settings-reference.md` の対象外であり、あちらに載せる値は無い。

設定を変えたい場合に受け取るものは `markxdown` キーの `ModuleOptions` で、次の3つ。

| 名前 | 内容 | 既定値 |
|---|---|---|
| `headings.anchorLinks` | 見出しに自動でアンカーリンクを付けるか | `false` |
| `rehypePlugins['rehype-raw']` | 生 HTML を要素として描くか | `false` |
| `components` | `@nuxtjs/mdc` の `prose` と `map`（タグ名 → コンポーネント名の差し替え） | `prose: true` と、`pre` をフェンスの振り分けへ向ける対応1件 |

`components.map` が `pre` に当てる振り分け用のコンポーネント名は、切り出しに伴って改まる。
**新しい名前は未決。**

### 5. 面を置く

読むだけなら `MarkdownView`。

```vue
<MarkdownView
  ref="previewSurface"
  :value="proposal"
  :surface="false"
  :source-shown="sourceShown"
  testid="proposal-preview"
  class="px-8 py-8"
/>
```

生テキストのまま出すなら `MarkdownSource`。

```vue
<MarkdownSource ref="sourceSurface" :value="proposal" :surface="false" testid="proposal-source" />
```

中身が無いときに出すものは呼ぶ側が `#empty` で渡す。

```vue
<MarkdownView :value="document?.content">
  <template #empty>
    <EmptyState testid="document-missing" title="中身がありません">
      対象の文書を取得できませんでした。
    </EmptyState>
  </template>
</MarkdownView>
```

直す面を置くなら `MarkdownEditor`。保存の実行と保存先の決定は渡す側が持つ。

```vue
<MarkdownEditor
  :content="data?.content"
  :save="save"
  :can-save="upstreamConnected"
  testid="steering-document"
>
  <template #empty>
    <EmptyState testid="document-missing" title="中身がありません">
      この文書はまだ作られていません。
    </EmptyState>
  </template>
</MarkdownEditor>
```

### 6. 引き方は明示 import にする

auto-import に頼らず、`#markdown` から明示して引く（`openspec/specs/app-structure/spec.md`）。

```ts
import MarkdownView from '#markdown/render/MarkdownView.vue';
import MarkdownSource from '#markdown/render/MarkdownSource.vue';
import MarkdownEditor from '#markdown/edit/MarkdownEditor.vue';
import type { PositionPort, SourceRange } from '#markdown/position/types';
```

module の内側のファイルを直接指す import は書かない。この import の形は、実体が
リポジトリの中に在るか外部 package に在るかで変わらない。

## 関連

- `openspec/specs/markdown/module/spec.md` — 振る舞いの規定（本体）
- `openspec/specs/app-structure/spec.md` — 明示 import と置き場の規定
- `openspec/changes/remove-module-markdown/specs/markdown/module/spec.md` — 切り出しの決定が入る delta（進行中）
- `docs/specs/reference/mdc-observations.md` — 乗っている `@nuxtjs/mdc` の癖（崩れた前提7件と、それを固定しているテスト）
- `docs/specs/core/settings-reference.md` — stroke-board の設定の正（`markxdown` は対象外）
- `docs/specs/reference/stroke-modules.md` — `useAgentQuestion` / `AgentQuestion` の使い方
