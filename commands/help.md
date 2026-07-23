---
description: What 0latency (0l) is and how to use it — a friendly overview
allowed-tools: Read
---

Give the user a short, friendly orientation to the 0l plugin. Be warm and concise; use their
own words if they asked something specific. Cover, in plain language:

**What it is:** during a live product walkthrough, 0latency listens, and when someone describes
a real bug or decision ("the export button on invoices is broken"), it files a grounded GitHub
issue — with the screenshot you were looking at — while the meeting is still happening. One
person runs it; everyone else just talks.

**The three commands:**
- `/0l:setup` — one-time. Asks a few questions (GitHub org, default repo, notes repo, Deepgram
  key, your name), lists your repos so findings route correctly, and runs a preflight check.
- `/0l:start <title>` — opens a capture tab. Click **Start capture**, allow the mic, and share
  your **Google Meet TAB with "Also share tab audio" checked** (a whole-screen share has NO
  audio — this is the #1 mistake). Then just talk. Click the video preview to pin a screenshot.
- `/0l:finish` — ends the meeting: a summary, the transcript saved to your notes repo, and a
  TL;DR of every issue filed with exact numbers.

**Is it working?** The engine prints a heartbeat every 15s: `[0l] capturing · 00:12:40 · 7
utt/min · 2 issues filed`. If `utt/min` is stuck at 0, you shared a screen instead of a tab —
stop, restart, share the tab with tab-audio.

**Cost:** your own Deepgram key (~$0.70/hr, free for the first ~285 hours). The AI runs on your
own Claude Code seat — no extra key or bill.

**Is it safe?** The AI that reads the transcript has NO tools — it can only return findings as
data; the plain-code engine does the filing via your own `gh`. Nothing runs unsandboxed, and
there is no `--dangerously-skip-permissions` anywhere.

**Two switches** (in `~/.0latency/config.json`): `creation` (`auto` files live / `review` queues
drafts) and `execution` (reserved for later; off).

**Hit a problem?** Point them at the Troubleshooting table in the README, or `/0l:report` to
file a bug. Then ask if they want to walk through anything specific.
