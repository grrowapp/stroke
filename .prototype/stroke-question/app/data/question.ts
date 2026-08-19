// 実際のストロークで返ってくる形の問い（design.md 決定6 の構造）。
export type StrokeOption = {
  label: string
  detail: string
  recommended?: boolean
  rationale?: string
}

export type StrokeQuestion = {
  question: string
  background: string
  options: StrokeOption[]
}

export const sampleQuestion: StrokeQuestion = {
  question: '`claude -p` が失敗したときのリトライ回数をいくつにしますか？',
  background:
    '失敗した往復も AI 側のセッション履歴に残ることは実測で確認済みです（Claude Code 2.1.233）。そのためリトライはユーザーの入力を送り直さず、続きを促す形で送ると既に決まっています。残っているのは回数だけです。1回のリトライで応答までおよそ20〜60秒かかり、その間ユーザーは待機表示を見続けます。単一ユーザー前提なので、同時セッションによる負荷は考えなくて構いません。',
  options: [
    {
      label: '2回',
      detail:
        '失敗しても最大2回まで裏で続きを促す。回復しなければエラーを表示する。最悪の待ち時間は3回分（およそ1〜3分）。',
      recommended: true,
      rationale:
        '一過性の失敗はほぼ1回目のリトライで回復する。2回あれば取りこぼしを拾え、待ち時間も許容範囲に収まる。',
    },
    {
      label: '1回',
      detail:
        '1回だけ裏で試す。待ち時間は最大2回分に収まるが、連続して落ちる状況ではユーザーにエラーが出やすい。',
    },
    {
      label: '設定値にする',
      detail:
        '起動フラグと同じ runtimeConfig に置き、環境変数で変えられるようにする。運用で調整できるが、設定項目が1つ増える。',
    },
  ],
}
