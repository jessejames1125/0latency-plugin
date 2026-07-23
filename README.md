# 0latency plugin (`0l`)

Live meeting capture → frame-grounded GitHub issues, automatically.
One operator runs it; everyone else just talks.

## Install (once)

1. Prereqs: Node ≥ 20, `git`, `gh` (logged in), Claude Code (logged in), Chrome/Chromium/Edge.
2. In Claude Code: `/plugin marketplace add jessejames1125/0latency-plugin` then `/plugin install 0l`.
   (If your org manages plugins, ask your Claude admin to allowlist this marketplace first.)
3. `/0l:setup` — walks you through config (org, repos, Deepgram key), clones the notes repo,
   and runs preflight.

## Run a meeting

1. `/0l:start Weekly product walkthrough`
2. In the capture tab: **Start capture** → grant mic → share the **Google Meet TAB** with
   **"Also share tab audio"** checked. (A whole-screen share carries NO audio — this is the
   #1 mistake.)
3. Click the video preview to grab a frame and drag once to box what the room is pointing at.
4. Talk normally. Decisions become GitHub issues while the meeting runs (creation=auto).
5. `/0l:finish` — summary, transcript committed to the notes repo, TL;DR with exact issue numbers.

## The two switches (`~/.0latency/config.json`)

| Switch | Values | Default | Meaning |
|---|---|---|---|
| `creation` | `auto` / `review` | `auto` | File issues live, or queue drafts for /0l:finish review |
| `execution` | `off` / `on` | `off` | v0.1: stub. Phase 2: auto-fire a PR-only executor per issue |

## Rules of the road

- **One operator per meeting.** Two instances = duplicate issues.
- The engine auto-stops after 20 min of silence or 3 h wall clock — it will never run all night.
- Per-meeting spawn caps (default 20 event sessions) warn visibly at 80%.
- No `--dangerously-skip-permissions` anywhere: event sessions run under a fixed
  allowlist (`gh issue create`, `gh label create`, `gh api`, scoped `git`, `Read`).
- Consent: tell the room the meeting is transcribed. Stop capture (one click) if anyone objects.

## What runs where

| Piece | Runs on | Talks to |
|---|---|---|
| Capture engine (this repo) | operator's laptop, 127.0.0.1 only | Deepgram (audio → text) |
| Event/summary sessions | operator's Claude Code seat | GitHub via `gh` |
| Issues, frames, transcripts | your GitHub org | — |
