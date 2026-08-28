# create-module-markdown

Nuxt 4 標準の `modules/` を置き場としてパスに用意し、markdown の操作をそこへ切り出して疎結合にする。

markdown を扱う実体が `nuxt.config.ts`（parse 設定）・`app/components/global/`（フェンスの振り分け）・`app/components/workspace/`（コードブロック・図・本文の器・直す面）・`app/assets/css/main.css`（見た目）に散っており、描画の入口も3箇所に割れている。どこに閉じるのかを定めた spec が無く、次に markdown へ触る作業がどこを触ればよいのか参照元を辿らないと分からない。

同じ理由で注釈も動けない。注釈は本家の写しで生テキストの面にしか付けられず、整形された本文を読みながら指摘したい場でも面の切り替えを強いられる。

起票時点で意図したのは次の2つ。

- markdown を1つのモジュールに閉じ、外から見える口を絞る
- 注釈を別のモジュールとして分け、markdown の描き方を知らずに済むようにしたうえで、どの面でも指摘を付けられるようにする
