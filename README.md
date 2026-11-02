# AI Training Sandbox

A small, API-key-free starting point for experimenting with a local agent. It is intentionally a deterministic tool-using demo—not a trained foundation model and not general-purpose AI. It uses Python's standard library and browser JavaScript; no API keys, paid services, or Python packages are needed.

## Run it

Requires Python 3.10 or newer.

```bash
python3 server.py
```

Open <http://127.0.0.1:8000>. Stop the server with Ctrl+C. The server binds to loopback only, so it is available only on the same machine by default.

## What the agent can do

- **Plan:** create a small three-step starter plan from a goal.
- **Calculate:** evaluate basic arithmetic through a restricted AST parser. It does not use `eval()`.
- **Remember / show notes:** save and read up to 50 notes in `notes.json` next to the Python files.
- **Fallback:** explain its limits rather than pretending it knows current or general facts.

The agent follows a small local loop: classify the request, choose an explicitly supported tool, run that tool, and return a result. It cannot run shell commands, access the internet, or use arbitrary tools. The web fonts are an optional visual enhancement; the application and agent do not call an AI API.

## Test

```bash
python3 -m unittest -v
```

## Next steps

This starter is a foundation for agent architecture, not a model trained from scratch. Training a capable language model requires a large dataset and substantial compute. The next practical extension is a pluggable local inference backend (for example, an installed open-weight model), with this tool allowlist retained and each consequential action gated by user approval.
