# vLLM config mounts

Mounted read-only at `/config` in every service of `docker-compose.models.yml`.

`reranker_template.jinja` is required by **vllm-rerank** and is not bundled with
the model weights — it lives in the Qwen3-VL-Embedding repo. Fetch it before the
first `up`, or the reranker container will exit at startup:

```sh
curl -fsSL -o reranker_template.jinja \
  https://raw.githubusercontent.com/QwenLM/Qwen3-VL-Embedding/main/examples/reranker_template.jinja
```
