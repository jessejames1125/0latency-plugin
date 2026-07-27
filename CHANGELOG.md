# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `LICENSE` — Apache-2.0. The repository was previously public with no license, which made
  it all-rights-reserved and un-adoptable.
- `CONTEXT.md` — what the plugin does, who it's for, and explicitly who it isn't for.
- `SECURITY.md` — threat model, what leaves your machine, and how to report a
  vulnerability privately.
- `CONTRIBUTING.md`, `CHANGELOG.md`, issue and pull request templates.
- `CLAUDE.md` — orientation for AI assistants working inside this repository.
- Continuous integration: the test suite runs on Ubuntu and Windows across Node 20 and 22.
- `scripts/leak-check.sh` plus an installable pre-push hook, to keep credentials and
  private material out of a public repository.
- Package and plugin manifests now declare `license`, `repository`, `homepage`, `keywords`,
  and a supported Node range.

## [0.1.0] — 2026-07-23

First release.

### Added

- **Capture.** A browser capture tab streams two *separately tagged* audio channels — the
  operator's microphone (`0x01`) and shared tab audio (`0x02`) — so the operator and the
  room don't get summed into one stream. Video frames are diffed so only meaningful screen
  changes are retained.
- **Transcription.** A raw Deepgram live WebSocket client with reconnect and backoff,
  handling both audio modes.
- **Finding detection.** Transcript is batched in 60-second windows into a single scoped
  Claude session that returns findings as data. `review` mode queues drafts instead of
  filing live.
- **Issue filing.** The engine — not the model — files GitHub issues through the `gh` CLI,
  validating the target repository against the operator's real repo list, and pins each
  issue to a SHA-addressed frame image committed to a notes repository.
- **Engine lifecycle.** Detached entrypoint, two-stream wiring, 15-second heartbeat,
  automatic stop on 20 minutes of silence or 3 hours elapsed, and a sentinel stop file.
- **Cost control.** Per-category AI call caps with visible warnings at 80% of cap,
  persisted to disk across a session.
- **Preflight.** `/0l:setup` verifies Node, `git`, `gh` auth, Claude Code, a Chromium
  browser, and Deepgram reachability — including a proxy/firewall probe on the WebSocket
  path, which is the failure most likely to surprise a corporate network.
- **Commands.** `/0l:setup`, `/0l:start`, `/0l:finish`, `/0l:help`, `/0l:report`.

### Security

- The transcript-reading session runs with **no tools at all** and does not inherit local
  Claude Code settings, hooks, or ambient permissions. Prompt injection from meeting audio
  has nothing to act with.
- `--dangerously-skip-permissions` is never passed; a test asserts it can never appear in
  a spawned command.

### Fixed

- Capture pause/resume, Windows process spawning, missing error listeners, a tail-read
  loop, and overlapping timer ticks.

[Unreleased]: https://github.com/jessejames1125/0latency-plugin/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/jessejames1125/0latency-plugin/releases/tag/v0.1.0
