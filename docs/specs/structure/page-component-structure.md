# Page Component Structure

## Purpose

`components/page/` は、アプリケーションにおける **Page Component の実装を集約する領域**とする。

Nuxt の `pages/` が URL / Route Structure を表現するのに対し、`components/page/` は各 Route に対応する **Page Implementation Structure** を表現する。

Route Structure については、[Page Structure](./page-structure.md) を参照する。

## Structure

Page Component は、以下の階層で構成する。

```text
components/
└── page/
    └── <PageName>/
        └── <PageType>/
            └── Container.vue
```

各要素の意味は以下のとおり。

* `<PageName>`: 対象となるドメイン・リソースを表す。
* `<PageType>`: Page Component の用途・役割を表す。
* `Container.vue`: Page Component の実装エントリポイントを表す。

`<PageType>` は操作そのものを意味するものではなく、ページとしての役割を表す。

例えば以下のような構造とする。

```text
components/
└── page/
    └── Project/
        ├── Create/
        │   └── Container.vue
        ├── Detail/
        │   └── Container.vue
        ├── Info/
        │   └── Container.vue
        └── List/
            └── Container.vue
```

## Route Relationship

`components/page/` の Page Component は、Nuxt の `pages/` に定義された Route と対応する。

```text
pages/
  Route Structure
       │
       │ maps to
       ↓
components/page/
  Page Component Structure
       │
       ↓
  Page Implementation
```

例えば、

```text
pages/project/list.vue
```

に対応する Page Component は、

```text
components/page/Project/List/Container.vue
```

とする。

## Rules

* `components/page/` 配下に Page Component を集約する。
* Page Component は `<PageName>/<PageType>/` の階層で分類する。
* `<PageName>` は対象となるドメイン・リソースを表す。
* `<PageType>` はページの用途・役割を表す。
* `PageType` は `Create`、`Detail`、`Info`、`List` など、ページとしての責務を識別できる名称とする。
* `Container.vue` は、その Page Component における実装のエントリポイントとする。
* Page Component 内の UI やページ固有のロジックは、必要に応じて同一 Page Component 配下に分割する。
* `components/page/` は Route の都合ではなく、**ページとしての責務と構造**を基準に構成する。
* `pages/` と `components/page/` の対応関係を維持する。

## Example

```text
pages/
├── project/
│   ├── [id].vue
│   ├── create.vue
│   └── list.vue
└── customer/
    └── list.vue

components/
└── page/
    ├── Project/
    │   ├── Create/
    │   │   └── Container.vue
    │   ├── Detail/
    │   │   └── Container.vue
    │   └── List/
    │       └── Container.vue
    └── Customer/
        └── List/
            └── Container.vue
```

## Related Specification

Nuxt の `pages/` における Route Structure と Page Component の対応規則については、[Page Structure](./page-structure.md) を参照する。

