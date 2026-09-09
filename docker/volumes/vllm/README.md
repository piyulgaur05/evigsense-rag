# vLLM config mounts

Mounted read-only at `/config` in every service of `docker-compose.models.yml`.

Nothing is required here at present — the reranking stage was removed, and the
chat, OCR and embedding models all ship their own chat templates. The mount is
kept because it is the place to drop a template or config override when a model
does need one.
