## Context

症状と原因は proposal.md - Why を参照。ここには、そこへ至るまでに**外した仮説**と、設計を決めた実測を残す。当初の proposal はソースを読んだ推論に乗っており、その推論が2つとも誤っていた。

### 実測（すべて再現手順つきで確認）

| 対象 | 当てたもの | 結果 |
|---|---|---|
| ビルド済みサーバー | 異常切断7通り × 最大50接続 | 停止しない |
| dev | 実ブラウザのリロード・遷移・タブを閉じる ×10 | 停止しない |
| dev | kill -9 → 再起動（タブ3枚が再接続中） | 停止しない |
| dev | `terminate()` による強制 RST ×20 | **停止する** |
| dev | 通知チャネル `/ws` へ同じ強制 RST | **停止する** |

最後の1行が決め手だった。`/ws` のハンドラは `open` が同期で、`board.ts` 側で送信を try/catch し、失敗した peer を集合から外している。当初 design が「本筋」とした修正が**既に入っている**チャネルが同じ症状で止まる以上、修正の当て先が違う。

### 外した仮説

1. **「接続時配信の送信が失敗して落ちる」** — `ws` の `send()` は readyState が CLOSING / CLOSED のとき throw せず黙って捨てる（`node_modules/ws/lib/websocket.js:467`）。throw するのは CONNECTING のときだけ
2. **「socket に `'error'` の受け手を置けば止まる」** — 置いた。受け止めたログも出た。それでも停止した。rejection は socket の emitter ではなく、catch されていない Promise の側から来る
3. **「`listen` フック時点のリスナを差し替えれば止まる」** — `@nuxt/cli` は `listen` の**後**に `process.once("unhandledRejection", restart)` を足す。後から付いた分が素通りする
4. **「配らなければ止まる」** — `process.emit` を偽で返したら、Node が「未処理」と判定して `triggerUncaughtException` へ回し、かえって素の例外で落ちた

## Goals / Non-Goals

**Goals:**

- 症状（WS の異常切断で dev サーバーが止まる）が、詰め物を外すと**再現し**、入れると**再現しない**こと
- 本物の不具合は今までどおり表に出ること。切断を握るために全ての rejection を握らない

**Non-Goals:**

- ビルド済みサーバーの変更。そちらは元から止まらない
- `question.ts` / `proposal.ts` / `ws-channels.ts` の変更。原因ではなく、直しても症状は消えない
- 画面側の復帰（`useSessionChannel` の `autoReconnect`）。この症状とは無関係
- 上流の恒久修正。ここで作るのは詰め物であり、上流が直したら外す

## Decisions

### 決定1: `process.emit` の段で握り、`true` を返す

リスナの登録順に依存しないため、配布そのものを止める（外した仮説3）。そして **`true` を返す**。Node は `process.emit('unhandledRejection')` の戻り値で「誰かが処理したか」を判定し、偽なら `triggerUncaughtException` に回す（外した仮説4）。ここを取り違えると、黙らせたつもりでかえって落ちる。

*代替案*: `--unhandled-rejections=warn` を dev 起動に足す。**効かない**。Node のこのモードはリスナが無いときの既定の振る舞いを変えるだけで、`@nuxt/cli` は明示的にリスナを登録している。当初の proposal はこれを応急処置として挙げていたが、実際にはリポジトリのどこにも入っていなかった。

### 決定2: 握るのは接続リセット系だけに限る

`ECONNRESET` / `EPIPE` / `ECONNABORTED` のみ。相手が消えただけであり、サーバーの落ち度ではないので落とす理由にしない。それ以外は元のリスナへそのまま渡す。

握る範囲を広げると、上流が本来落とすべき不具合まで隠れる。単体で検めた結果、切断系はリスナに届かず、`TypeError` は届くことを確認済み。

対象のイベントも `unhandledRejection` **だけ**とする。当初は `uncaughtException` も握っていたが、そちらから ECONNRESET が来る実測が無く、根拠なく範囲を広げていた。外して確認を走らせ、3チャネルとも生存することを確かめてある。

### 決定2b: `process.emit` の差し替えは1プロセスに1回だけ

`listen` は dev の再起動（`nuxt.config.ts` の編集・`.env` の変更・`restart` フック）のたびに、同じプロセス・同じ server に対して再び呼ばれる。`process.emit` の差し替えを素直に書くと、再起動のたびにラップが1段ずつ積み上がり、クロージャと呼び出しコストが増え続ける。`Symbol.for` の目印で二度目以降を弾く。

`server.prependListener('upgrade', …)` の側は逆に**毎回登録し直す必要がある**。上流が `close` フックで `removeAllListeners('upgrade')` を呼ぶため、再登録しないと再起動後に受け手が消える。

### 決定2c: 握った分は必ずログに出す

この詰め物はプロセス全体の rejection を対象にする。upgrade の経路に絞れないのは、rejection のスタックが TCP 層だけで JS のフレームを持たず、発生点を掴めないからである。

黙って捨てると、アプリ自身の catch し忘れが同じコードを持っていたときに気付けない。`console.warn` で出しておけば、量や出どころから異常に気付ける。

### 決定3: 完了の判定は dev に対する確認コマンドで行う

症状は dev でしか起きない。E2E は `.output` を立てるので、**修正の前後どちらでも通る**（実測）。E2E を判定に使うと、直っていなくても緑になる。

`yarn check:ws-disconnect` を別口として置き、動いている dev サーバーへ当てる。`scripts/session.ts` と同じ「サーバーの外から叩く script」の形に揃える。

*代替案*: 確認コマンドが自分で `yarn dev` を起こす。このマシンは worktree を並べて動かしており、他のツリーの dev を巻き込む事故が起きうるので採らない。起こすのは人の側とする。

### 決定4: 詰め物を外す口を残す

`WS_GUARD_OFF=1`。これが無いと、確認が緑である理由が「症状が起きない」のか「確認が症状を捉えていない」のか区別できない。task 1.4 で書いた回帰テストが常に緑で、症状をまったく捉えていなかった実例がある。

## Risks / Trade-offs

- **上流の内部に乗っている** → 上流が upgrade の失敗を扱うようになれば不要になる。`WS_GUARD_OFF=1` で外して確認が緑のままなら、撤去してよい合図とする。確認したバージョンを `nuxt.config.ts` に明記してある（nuxt 4.5.2 / @nuxt/cli 3.37.0）
- **`process.emit` の差し替え** → 対象を2つのイベントと接続リセット系に絞ってあり、それ以外は素通りする。dev でしか走らない（ビルド済みの出力は `nuxt.config.ts` を読まない）
- **確認が手動** → `yarn dev` を起こしてから叩く2手が要る。自動で起こすと他のツリーを巻き込む事故のほうが高くつく
- **切断系の rejection が本物の不具合を隠す可能性** → 例えばサーバー自身のバグで内部接続が切れている場合、それも握られる。範囲を3コードに絞り、握った分を `console.warn` に出すことで抑えているが、ゼロではない。なお現時点のコードに実例は無い（`fetch` を使う `server/utils/upstream/rest.ts` と `server/plugins/01.retry-failed.ts` は全ての `await` が try/catch 済み、本家への WS クライアント `server/utils/upstream/socket.ts` は同期で `'error'` リスナを登録しており rejection 経路を通らない。いずれもレビューで確認）
- **`isDisconnect` がトップレベルの `.code` しか見ない** → `AggregateError`・`cause` でラップされた形・`.code` を持たずメッセージだけに `ECONNRESET` を含む形は拾えない。実測した症状はトップレベルの `.code` に載る形だけなので現状は誤りではないが、Node や上流がラップの仕方を変えると判定が黙って効かなくなり症状が戻る。`yarn check:ws-disconnect` がそれを捕まえる
- **`process.emit` の差し替えという手段そのもの** → 型のキャスト（`as typeof process.emit` / `as never`）は Node の型定義がイベント名ごとのオーバーロードの集まりであるために必要で、他に汎用ラッパーを書く手段がほぼ無い（`tsc --strict` で確認）。`as never` は引数の対応検査を無効にするため、この関数を触るときは型でなく実挙動で確かめること

## Migration Plan

不要。振る舞いの追加のみで、データ形式・API 契約・画面・ビルド済みサーバーのいずれも変えない。ロールバックは revert で足りる。
