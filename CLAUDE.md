# Working in this repository

Orientation for an AI assistant asked to understand, evaluate, or change this project.

## What this is

A Claude Code plugin (`0l`) plus the capture engine behind it. It listens to a live
product walkthrough and files frame-grounded GitHub issues while the meeting is still
running.

**If you were asked "would this be useful for us?" — read [CONTEXT.md](CONTEXT.md).** It
states the problem, who it fits, and, importantly, who it doesn't. Don't infer a verdict
from the code; the disqualifiers are the part that matters.

## Layout

| Path | What it holds |
|---|---|
| `.claude-plugin/` | `plugin.json` and `marketplace.json` — the plugin manifests |
| `commands/` | The five slash commands: `setup`, `start`, `finish`, `help`, `report` |
| `prompts/` | `event-session.md` — the prompt for the tool-less finding session |
| `engine/` | All runtime code (see below) |
| `test/` | `node --test` suites, one per engine module |
| `scripts/` | `leak-check.sh`, `install-hooks.sh` |

Engine modules, roughly in dataflow order:

- `capture.html` / `capture-server.js` — browser capture tab and the local WebSocket
  server that relays tagged PCM and frames
- `deepgram.js` — raw live transcription WebSocket, with reconnect/backoff
- `frame-diff.js` — keeps only meaningful screen changes
- `spine.js` — the event log; append-only JSONL
- `gate.js` / `firing.js` — decides what counts as a finding and when to act
- `claude.js` — spawns the scoped, tool-less headless session
- `caps.js` — per-category AI call caps, file-backed
- `gh.js` / `notes.js` — issue filing and frame/transcript commits
- `config.js`, `util.js`, `preflight.js`, `index.js` — config, helpers, checks, entrypoint

## Constraints — these are load-bearing

- **CommonJS.** No ESM, no TypeScript, no build step.
- **One runtime dependency: `ws`.** Do not add more.
- **Log and continue.** A bad frame or a failed AI call must never crash the pipeline or
  discard events already captured. A meeting cannot be re-run.
- **The model never acts.** The event session returns findings as *data*; `engine/`
  performs every side effect with fixed command shapes. Never route a side effect through
  the model, and never widen the event session's tool access — the isolation is the
  security model, documented in [SECURITY.md](SECURITY.md).
- **`--dangerously-skip-permissions` never appears.** `test/claude.test.js` enforces this.
  Do not work around that test.
- **Windows is a first-class target.** It is the primary development platform. Git Bash
  rewrites leading-slash CLI arguments into Windows paths — watch for it when passing
  route-like arguments. CI runs Ubuntu and Windows.
- **This repository is public.** Never commit credentials, meeting transcripts, session
  artifacts, or private notes. Run `bash scripts/leak-check.sh` before pushing.

## Running things

```bash
npm test                          # 60 tests, no API keys needed, fully offline
node --test test/gate.test.js     # one suite
npm run preflight                 # verify external dependencies
claude plugin validate            # after touching .claude-plugin/*
bash scripts/leak-check.sh        # before pushing
```

If a test requires network access or a real API key, that is a bug in the test.

## Before claiming something works

`npm test` passing means the units behave. It does not mean a live meeting was captured
end to end — that path involves a browser, a microphone, Deepgram, and GitHub, and is not
exercised by the suite. Say which one you verified.
