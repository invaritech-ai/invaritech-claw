# Providers

iclaw v1 supports two model providers: OpenRouter and Ollama.

Model references are provider-prefixed:

```text
openrouter/<provider-model-id>
ollama/<local-model-id>
```

## OpenRouter

Config:

```json5
{
  providers: {
    openrouter: {
      apiKey: { env: "OPENROUTER_API_KEY" },
      baseUrl: "https://openrouter.ai/api/v1",
    },
  },
  agents: {
    main: {
      model: "openrouter/anthropic/claude-sonnet-4.6",
      tools: [],
    },
  },
}
```

OpenRouter model ids are passed through dynamically. iclaw does not maintain a local OpenRouter catalog in v1.

## Ollama

Config:

```json5
{
  providers: {
    ollama: {
      baseUrl: "http://127.0.0.1:11434",
    },
  },
  agents: {
    main: {
      model: "ollama/llama3.2",
      tools: [],
    },
  },
}
```

Ollama model discovery uses `/api/tags`.

## Streaming

Both providers stream model output into run events. Tool calls are recorded as `tool.call` events. Run execution records start, output deltas, success, failure, and approval-wait transitions.

## Adding Providers Later

Keep provider additions behind the internal provider interface:

- provider id
- `stream(input)` implementation
- optional `listModels()`
- config validation
- focused transport tests

Do not add broad provider catalog machinery until a real customization needs it.
