# Page Structure

## Purpose

Nuxt の `pages/` は、ファイルベースルーティングによる **URL と Page Component の対応定義**として使用する。

ページ固有の実装や UI は `pages/` に直接記述せず、`components/page/` 配下の Page Component に集約する。

Page Component の構造については、[Page Component Structure](./page-component-structure.md) を参照する。

## Structure

```text
pages/
└── <route>/
    └── <page>.vue

components/
└── page/
    └── <PageName>/
        └── <PageType>/
            └── Container.vue
```

例えば Project の一覧ページは以下のように構成する。

```text
pages/
└── project/
    └── list.vue

components/
└── page/
    └── Project/
        └── List/
            └── Container.vue
```

この場合、Route と Page Component の対応は以下となる。

```text
/pages/project/list.vue
        ↓
/components/page/Project/List/Container.vue
```

## Rules

* `pages/` は Nuxt のファイルベースルーティングを表現するために使用する。
* `pages/` のディレクトリ・ファイル構造と URL 構造を一致させる。
* `pages/` の各ファイルは、原則として対応する Page Component を呼び出すだけの薄いエントリポイントとする。
* `pages/` にはページ固有の UI やビジネスロジックを実装しない。
* 実際のページ実装は `components/page/` 配下に配置する。
* Route と Page Component の対応関係を明確に維持する。

## Example

```vue
<template>
	<Suspense>
		<PageProjectListContainer />
	</Suspense>
</template>
```

上記の Route は、`components/page/Project/List/Container.vue` の Page Component を使用する。

## Related Specification

Page Component のディレクトリ構造、`PageName`、`PageType` および `Container.vue` の定義については、[Page Component Structure](./page-component-structure.md) を参照する。

