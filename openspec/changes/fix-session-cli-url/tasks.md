# fix-session-cli-url — tasks

## 1. 修正

- [ ] 1.1 `scripts/session.ts:32` の出力を `${DEFAULT_API_BASE_URL}/s/${sessionId}` から `${DEFAULT_API_BASE_URL}/strokes/${sessionId}` へ直す

## 2. 確認

- [ ] 2.1 `yarn typecheck` が通ることを確認する
- [ ] 2.2 `yarn session create` で実セッションを作り、出力された URL を開いて 200 が返ることを確認する。確認後、作ったセッションは `yarn session delete` で消す

## 3. commit

- [ ] 3.1 この change の成果物を commit する
