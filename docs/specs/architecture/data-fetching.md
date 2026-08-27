# データ取得と SSR

画面のデータ取得の設計。Nuxt 4 の SSR 安全なパターンに従う。配置の規範は `docs/specs/core/system-structure.md`、api の契約は `docs/specs/api/contract.md`。

## 規定

- **ページデータは `useFetch` / `useAsyncData`** で取り、SSR の結果をペイロードで引き継ぐ。ハイドレーション時に二度取りしない
- **ユーザー操作起点の書き込みは `$fetch`**。回答の送信・AI の起動（契約 U7 / U13）、差し戻し・承認など
- **API の呼び出しは関心の口に集約する。** プロジェクト単位の画面は `useProjectApi` が唯一の口。画面ごとに URL を書くとエンドポイントの形が画面の数だけ散り、形が変わったときに直す場所が散らばる
- **最初のレンダリングを決定論的に保つ。** ブラウザ専用の処理（ストレージ読み取り・時刻・乱数）は SSR マークアップに直接入れず、`onMounted` / `import.meta.client` / `ClientOnly` の後ろに置く
- ナビゲーションをブロックすべきでない非重要データは `lazy` で取り、`status === 'pending'` を画面で扱う

## WS の受信

- 通知は `useBoardSocket`（シングルトン。画面ごとに接続を張らない。SSR では接続しない）
- セッションの問いと proposal は契約 W1 / W2 の受け口（`useSessionChannel` にチャンネル名と型を渡して呼ぶ）。画面は最後に届いた1件で表示を上書きする
