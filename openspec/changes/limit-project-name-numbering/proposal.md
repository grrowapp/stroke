## Why

**プロジェクト名の連番採番に終了条件が無い。**

`server/utils/stroke/project.ts:70-73`:

```ts
for (let n = 2; ; n++) {
  const name = `${candidate}-${n}`
  if (!existing.has(name)) return name
}
```

既存名が埋まっている限り回り続ける。`readdir()` の結果を `Set` に持っているので I/O は起きないが、**空きが無ければ止まらない。**

実際に起きるかは別として、終了条件を持たないループが承認の経路にある。承認は AI の提案をユーザーが確定する操作で、そこで応答が返らなくなると、何が起きたのかユーザーには分からない。

## What Changes

**上限を設け、超えたら失敗させる。**

- 連番の上限を決める（値は design で決める。`settings.ts` の固定値か、schema の定義か、どちらに置くかも含めて）
- 上限に達したら、空きが無いことをユーザーに示して止める。黙って回り続けない

上限の値そのものより、**終了条件を持つこと**が目的である。

## Capabilities

### New Capabilities

なし。

### Modified Capabilities

`project-generation` — 名前の採番。実装時に delta を書く。

## Impact

- `server/utils/stroke/project.ts` — `resolveAvailableProjectName()`
- 承認の endpoint — 失敗を返す経路

**出どころ**: `docs/known-issues.md` の「プロジェクト名の連番採番に上限が無い」。同資料はこの change を起こしたことで廃止する。
