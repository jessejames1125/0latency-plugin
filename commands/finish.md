---
description: End the 0latency meeting — summary, transcript commit, TL;DR with issue numbers
allowed-tools: Read, Write, Bash(node:*), Bash(git:*), Bash(gh issue create:*), Bash(gh label create:*), Bash(gh api:*), Bash(cp:*), Bash(mkdir:*), Bash(sleep:*)
---

Finish the most recent 0latency meeting.

1. Find the newest session: the most recently modified directory under
   `~/.0latency/sessions/`. Call it SESSION. Read `SESSION/events.jsonl`.
2. If the engine is still running (`SESSION/stopped.marker` absent): write the file
   `SESSION/stop.sentinel` (any content), then wait until `SESSION/stopped.marker`
   appears (check every 2s, up to 30s). If it never appears, tell the user the engine
   may have died and continue with what was captured — never lose prior events.
3. REVIEW-MODE DRAFTS: if `SESSION/queue.md` exists and has unchecked `- [ ]` lines,
   show them to the user and ask which to file. File each approved one with
   `gh issue create` using the same body format as the live pipeline: a `## Finding`
   section quoting the draft line verbatim with speaker and elapsed time, and the
   `## Ground rules` footer ("Claim by assigning yourself. Post progress on this issue,
   not in chat. Filed automatically by 0latency."). Route each to a repo from the
   config roster (~/.0latency/config.json), defaulting to `default_repo` with an extra
   `0l:route-unsure` label when uncertain. `sleep 2` between creates.
4. TRANSCRIPT: from the utterance events, write `SESSION/transcript.md`:
   `# <title> — <date>`, then one line per utterance: `**<speaker>** (<hh:mm:ss elapsed>): <text>`.
5. SUMMARY: write `SESSION/summary.md` — 3–5 plain sentences of what the meeting decided,
   then a `## Issues filed` section listing EVERY `action_taken` event plus every issue
   filed in step 3: `- #<number> <title> — <url>` (extract the number from the URL).
   The team cross-checks this list against the transcript — numbers must be exact.
6. COMMIT to the notes repo clone at `~/.0latency/notes/<notes-repo-name>`:
   - `mkdir -p <clone>/docs/meetings/<meeting-id>/`
   - Copy `transcript.md`, `summary.md`, and the whole `SESSION/frames/` directory in.
   - `git pull --rebase`, `git add docs/meetings/<meeting-id>`,
     `git commit -m "0l: meeting <meeting-id> transcript + frames"`, `git push`.
   - If push is rejected (protected branch): `git push origin HEAD:0latency/meetings`.
7. TL;DR to the user: meeting title, duration, utterance count, every filed issue with
   exact number and link, where the transcript landed (repo + path + branch), and — if
   `SESSION/stopped.marker` says `idle` or `max` — a note that capture auto-stopped early.
