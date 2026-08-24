## Why

`docs/question-flow.md` は `modularize-agent-question` の実装が入る前の往復を描いている。あの change で画面側に後始末が1つ増えたが、図に反映していない。

図と実装が食い違ったまま置くと、次に読む人が図を根拠に判断して外す。

## What Changes

- 並びの図に、往復の決着で画面が今の1問を手放す動きを足す
- 配信の節に、サーバが問いの取り下げを流さないこと、それを画面側が決着で埋めていることを足す
- 図と本文以外は触らない。`docs/schema.md` は変更しない

## Capabilities

### New Capabilities

なし。

### Modified Capabilities

なし。資料だけを直し、振る舞いを変えない。

## Impact

- `docs/question-flow.md` — 図1枚と本文の一部
- コードは変更しない
