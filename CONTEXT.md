# Is `0l` useful for us?

This file exists so you — or an AI assistant you've pointed at this repo — can decide
that in about two minutes, without installing anything.

---

## What it does, in one line

**`0l` listens to a live product walkthrough and files frame-grounded GitHub issues while
the meeting is still happening.**

---

## The problem it solves

A team gets on a call and walks through the product. Someone says *"the export button on
invoices is broken."* Three things then usually happen:

1. The remark lands in a transcript nobody opens.
2. Whoever remembers it writes a ticket hours or days later, from memory, without the
   screen it referred to.
3. The ticket loses the thing that made it actionable — *which* screen, *which* state,
   *what* it looked like at that moment.

The gap isn't that the team lacks tools. It's that the moment of highest fidelity — the
person pointing at the screen and saying what's wrong — is the moment nothing is
capturing. Everything downstream is a lossy reconstruction of it.

`0l` records at that moment: the utterance, plus the frame that was on screen when it was
said, committed as an image and linked from the issue.

---

## Who this is for

The qualifier is one question: **does your team run product walkthroughs?** Live sessions
where someone drives the product and other people react to it.

That covers a lot of shapes:

- Weekly product/design review, sprint demo, or bug bash
- Two founders demoing to each other
- Onboarding a customer and hearing what confuses them
- QA walking a build with an engineer
- Any recurring "let me show you where it's at" call

You don't need a PM, a specific headcount, or a particular process. If nobody at your
company ever shares a screen and talks about the product, this is not for you.

It also assumes you already:

- Track work in **GitHub Issues** (not Jira, not Linear — see below)
- Use **Claude Code**
- Meet in a **browser tab** (Google Meet, Zoom web, Teams web) on **Chromium/Chrome/Edge**

---

## When it's *not* for you

Stated plainly, because a tool that won't admit its limits isn't worth evaluating:

- **You don't use GitHub Issues.** Issue creation goes through the `gh` CLI. There's no
  Jira/Linear/Asana path today.
- **You meet in a native desktop app** (Zoom desktop, Teams desktop). Capture needs a
  browser *tab* with tab-audio; a desktop app window can't be captured with audio.
- **You're on Safari or Firefox.** Tab-audio capture is Chromium-only.
- **You can't send meeting audio to a third party.** Transcription goes to Deepgram. If
  your meetings are under a confidentiality regime that forbids that, stop here.
- **You need multiple people running it on one call.** One operator per meeting; two
  produce duplicate issues.
- **You want a meeting-notes summarizer.** Plenty of those exist and they're better at it.
  This one is narrow on purpose: it produces *issues with visual evidence*, not minutes.
- **You want it fully autonomous.** It's opinionated but not magic — expect to review what
  it files, especially early. There's a `review` mode that queues drafts instead.

---

## How it works

```
your mic  ─┐
           ├─→ capture tab (localhost) ─→ engine ─→ Deepgram (speech → text)
tab audio ─┘         │                     │
                     │                     ├─→ finding detection (your Claude Code seat)
              video frames ────────────────┤
                                           ├─→ frame + transcript → your notes repo (git)
                                           └─→ issue → your GitHub (gh CLI)
```

Two audio streams stay tagged and separate — your mic (`0x01`) and the shared tab
(`0x02`) — so the operator's voice and the room's voices don't get summed into one
undifferentiated blob. Frames are diffed so only meaningful screen changes are kept.

Everything runs on your laptop, bound to `127.0.0.1`.

---

## What it touches

| It reads | It writes | It sends off-machine |
|---|---|---|
| Your mic + the tab you explicitly share | GitHub issues in repos you name | Audio → Deepgram, for transcription |
| Screen frames from that tab | Frames + transcripts → a notes repo you name | Transcript text → your own Claude Code seat |
| `~/.0latency/config.json` | A local session directory | Nothing else |

**It does not** read your codebase, your filesystem, your other repos, your email, or
anything you didn't explicitly share into the capture tab.

The AI session that reads the transcript **has no tools** — no file access, no shell, no
web, no MCP — and does not inherit your local Claude settings or hooks. It returns a list
of findings *as data*. The engine, which is ordinary auditable JavaScript, performs every
side effect with fixed commands, and validates any AI-chosen repo against your real repo
list before filing. `--dangerously-skip-permissions` never appears, and a test enforces
that. See [SECURITY.md](SECURITY.md).

---

## What it costs to run

- **Deepgram** (speech-to-text): your own API key, roughly $0.70/hour of meeting. New
  accounts get $200 of credit, which is on the order of 285 meeting-hours.
- **The AI work**: runs on your existing Claude Code seat. No additional key, no
  additional bill.
- **Everything else**: nothing. No servers, no accounts, no other services.

---

## Status and limitations

**v0.1.1 — early.** The engine has 60 unit tests covering capture, transcription
handling, the finding gate, caps, issue filing, and the safety constraints, and they run
green with no API keys. That is not the same as being hardened across every meeting setup
in the world. Expect rough edges on first run; the [issue tracker](https://github.com/jessejames1125/0latency-plugin/issues)
is the right place for them.

Known constraints, all deliberate:

- One operator per meeting.
- Auto-stops after 20 minutes of silence or 3 hours, whichever comes first.
- A per-meeting cap on AI calls (default 20), with a warning at 80%.
- The `execution` config switch is reserved for a future version and is a no-op today.

---

## Non-goals

- Not a meeting recorder or a notes app.
- Not a transcript search product.
- Not a hosted service — there is no backend to sign up for, and nothing phones home.
- Not trying to replace your issue tracker; it feeds the one you already have.

---

## License

Apache-2.0. See [LICENSE](LICENSE). Use it, fork it, ship it in your company.
