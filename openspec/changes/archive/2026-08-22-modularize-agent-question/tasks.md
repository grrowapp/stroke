## 1. 問いの往復を composable に切り出す

- [x] 1.1 `app/composables/useAgentQuestion.ts` を追加する。`useAgentQuestion(sessionId)` の形で、`useQuestionChannel` の購読を内側に持ち、今の1問を公開する（design 決定2）
- [x] 1.2 待機の状態を内側に持ち、`waiting` と `failed` を返り値として公開する。外から渡す口は設けない（design 決定3）
- [x] 1.3 W1 が次の1問を配信した瞬間に待機を終える。ブラウザを開き直したときも、再接続で届く現在の1問から状態を組み直せることを確かめる（design 決定3）
- [x] 1.4 回答の送信を1つの操作にまとめる。`api/answer` の受理が成功した直後に `api/invoke-agent` を要求し、成功したら待機を開始する（`specs/api/answer`）
- [x] 1.5 送信の失敗と、AI から応答が得られなかった場合に、同じ問いのまま送り直せる状態へ戻す（`specs/agent-question`「送れなかった回答は同じ問いのまま送り直せる」）
- [x] 1.5b 送れなかった理由を `error` として返す。送信の失敗・起動要求の 409・それ以外の起動失敗を書き分ける（design 決定3）
- [x] 1.6 答えた数（`answered`）を持ち、公開する。総数は持たない（`specs/proposal-review`「総数を示さない」）
- [x] 1.7 待機中は追加の送信を受け付けないことを、composable 側で担保する

## 2. 問いの面を画面に依存しない部品として切り出す

- [x] 2.1 `app/components/AgentQuestionModal.vue` を追加する（design 決定5）。問い・待機・答えた数を props で受け、回答を emit する。`$fetch` は持たない（design 決定1）
- [x] 2.2 話題タグ → 詳細説明 → 問い本文 → 選択肢 → 自由入力欄の並びで出す。推奨の選択肢には印を付ける（`specs/agent-question`「問いの見え方は画面によって変わらない」）
- [x] 2.3 選択肢と自由入力を排他にし、どちらも無いままでは送れず、回答が必要であることを示す（`specs/agent-question`「回答は選択肢か自由入力のどちらか一方」）
- [x] 2.4 回答が済むまで閉じる要求（ESC・背景クリック・閉じるボタン）を受け付けない。`open` は `v-model` で置く側が持つ（design 決定4）
- [x] 2.5 待機中は面の中に待機表示を出す。文言は props で受け取る（`specs/agent-question`「次を待つ間の待機は面の中で示す」）
- [x] 2.6 問いが次に置き換わったら、選択と自由入力欄を空に戻す（`specs/agent-question`「書きかけは次の問いへ持ち越さない」）
- [x] 2.7 面は画面を覆い切らない幅に留め、背後の本文が見えるようにする（design Risks）

## 3. 画面2 の問い返しを載せ替える

- [x] 3.1 `useProposalReview` から自前の `useQuestionChannel` の呼び出しを外し、`useAgentQuestion` のインスタンスを1つ作って、そこから問いを読む（design 決定2）
- [x] 3.2 `useProposalReview` が持つ待機は差し戻し用として残す。問い返しの待機は `useAgentQuestion` が返すものを読む（design 決定3）
- [x] 3.3 `answerFollowup` の送信と起動要求を `useAgentQuestion` の操作へ置き換える。`pendingAction` による差し戻しの決着判定は `useProposalReview` に残す（design Risks）
- [x] 3.4 `app/pages/s/[sessionId]/proposal.vue` の `ReviewFollowupModal` を `AgentQuestionModal` に差し替え、待機文言に「AI が次を考えています…」を渡す（`specs/proposal-review`）
- [x] 3.5 `app/components/review/FollowupModal.vue` を削除する（design 決定6）
- [x] 3.6 点滅する知らせ帯から面を開く経路と、AI が問い返しを打ち止めたときに面が閉じる動きが、今までどおり動くことを確かめる

## 4. 確かめる

- [x] 4.1 差し戻し → 問い返し → 回答 → 次の問い → 打ち止め → 出し直された proposal の一連を、画面2 で通しで動かす
- [x] 4.2 問い返しの面を、答えずに ESC・背景クリック・閉じるボタンで閉じようとしても閉じないことを確かめる
- [x] 4.3 回答を送ってから次が返るまでの間、面の中に「AI が次を考えています…」が出て、続けて送れないことを確かめる
- [x] 4.4 `claude -p` が応答を返さなかったとき、面が開いたまま同じ問いに答え直せることを確かめる
- [x] 4.5 画面1（ストローク）の見た目と動きが今回の変更前と変わっていないことを確かめる
- [x] 4.6 画面2 で W1 の接続が1本であること、差し戻しの待ち受け中は問い返しの知らせ帯が出ない（待機が同時に立たない）ことを確かめる

## 5. 記録を合わせる

- [x] 5.1 `docs/api-contract.md` に画面側の記述があれば、問いの受け口が1つの機構になったことを反映する
- [x] 5.2 `docs/stroke-modules.md` の冒頭から「予定」の断りを外し、返り値・props・呼び出し例を実物に合わせる（資料は `add-stroke-module-reference` で先に置いてある）
- [x] 5.3 `openspec validate modularize-agent-question --strict` を通す
