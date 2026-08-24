// 過去のストローク。パンくずの粒を開いたときに、そのとき出ていた選択肢ごと見せる。
export type PastStroke = {
  question: string
  options: { label: string; recommended?: boolean }[]
  answer: string
  free?: boolean
}

export const sampleHistory: PastStroke[] = [
  {
    question: 'このシステムは誰が使いますか？',
    options: [
      { label: '自分ひとり', recommended: true },
      { label: '家族で共有' },
      { label: '複数世帯' },
    ],
    answer: '自分ひとり',
  },
  {
    question: '在庫はどこに持ちますか？',
    options: [
      { label: 'SQLite', recommended: true },
      { label: 'ブラウザのローカル保存' },
      { label: '外部のデータベース' },
    ],
    answer: 'SQLite',
  },
  {
    question: '賞味期限が切れたものはどう扱いますか？',
    options: [
      { label: '自動で消す' },
      { label: '残して警告を出す', recommended: true },
      { label: '別の一覧へ移す' },
    ],
    answer: '消さずに残して、赤く出す。捨てたかどうかは自分で消し込む',
    free: true,
  },
  {
    question: 'レシピはどこから登録しますか？',
    options: [
      { label: '手入力だけ', recommended: true },
      { label: 'URL から取り込む' },
      { label: '写真から読み取る' },
    ],
    answer: '手入力だけ',
  },
]
