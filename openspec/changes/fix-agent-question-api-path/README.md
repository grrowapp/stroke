# fix-agent-question-api-path

`app/composables/useAgentQuestion.ts:58` の API 基底パスが `/api/${id}` になっており、実ルート `/api/strokes/[id]/answer` / `/api/strokes/[id]/invoke-agent` と食い違う。
このため問い返しの回答送信が 404 になる。基底を `/api/strokes/${id}` へ直す。
