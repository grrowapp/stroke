## 1. 骨格を置く

- [x] 1.1 `docs/stroke-modules.md` を作る。冒頭に、これが `modularize-agent-question` で切り出す2つのモジュールの資料であることと、実装はまだ入っていない**予定**であることを書く（design 決定2・決定3）
- [x] 1.2 この資料が扱うのは使い方だけで、振る舞いの規定は `openspec/specs/agent-question` が本体であることを冒頭に書く（design 決定1）
- [x] 1.3 2つの節を「何を持つか / 何に依存するか / どこから呼ばれるか / 呼び出し例」の4見出しで揃える（design 決定4）

## 2. `useAgentQuestion` を書く

- [x] 2.1 引数（セッション id 1つ）と、返すもの（`question` / `waiting` / `failed` / `answered` / `send`）を書く（design 決定5）
- [x] 2.2 状態を外から渡す口が無いことと、その理由（`useWebSocket` と同じ形）を添える
- [x] 2.3 依存する境界を `docs/api-contract.md` の番号（W1・U7・U13）で示す
- [x] 2.4 型は `shared/types.ts` を参照するだけにし、資料側で型定義を書き写さない

## 3. `AgentQuestionModal` を書く

- [x] 3.1 props と emit を書く。開閉を置く側が持つこと、待機文言を受け取ること
- [x] 3.2 規定（並び・回答するまで閉じない・待機の示し方）は書かず、`openspec/specs/agent-question` への参照を張る（design 決定1）

## 4. 設置の手順と例を書く

- [x] 4.1 画面に置くまでの順で手順を書く。composable を呼ぶ → 面を置く → 開く引き金を決める
- [x] 4.2 呼び出し例を載せる。画面2（問い返し）の形を実例にする

## 5. 周りを合わせる

- [x] 5.1 `CLAUDE.md` の Docs 一覧に `docs/stroke-modules.md` の1行を足す
- [x] 5.2 `openspec/changes/modularize-agent-question/tasks.md` に、実装後に予定の印を外し、実物に合わせるタスクを足す（design Risks）

## 6. 読み合わせる

- [x] 6.1 `docs/stroke-modules.md` を通しで読み、`useAgentQuestion` の呼び出し形で認識が合うかをユーザーに確認する
- [x] 6.2 ずれが出たら、`modularize-agent-question` の design.md を先に直し、それから資料を直す（本体は spec と design 側）
