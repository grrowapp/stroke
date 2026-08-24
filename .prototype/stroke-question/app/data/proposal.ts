// 画面2 に出す proposal のサンプル。OpenSpec の proposal 形式。
export const sampleProjectName = 'recipe-stock-keeper'

export const sampleProposal = `## Why

冷蔵庫にあるものを把握できず、同じ食材を二重に買ってしまう。買い物前に在庫を見られる場所が要る。

## What Changes

- 食材の在庫を登録・消し込みできる一覧を作る。
- 賞味期限が近いものを上に寄せて表示する。
- レシピを登録し、在庫から作れるものだけを絞り込めるようにする。
- 買い物リストを在庫の不足から自動で組み立てる。
- **BREAKING** 既存のメモアプリからの取り込みは行わない。

## Capabilities

### New Capabilities

- \`stock-list\`: 食材の在庫の登録・消し込み・賞味期限順の表示。
- \`recipe-match\`: レシピ登録と、在庫から作れるレシピの絞り込み。
- \`shopping-list\`: 在庫の不足から買い物リストを組み立てる。

### Modified Capabilities

なし。

## Impact

- 新規 Nuxt アプリ一式。データは SQLite に持つ。
- 単一ユーザー前提。認証は作らない。
- 賞味期限の通知は対象外（次の change で扱う）。
`
