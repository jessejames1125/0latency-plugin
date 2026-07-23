---
description: One-time 0latency setup — config, notes-repo clone, dependency install, preflight
allowed-tools: Read, Write, Bash(node:*), Bash(npm install:*), Bash(git clone:*), Bash(gh repo list:*), Bash(gh api:*), Bash(mkdir:*)
---

You are configuring the 0l plugin on this machine. The plugin root is the directory this
command file lives in, two levels up (it contains `engine/` and `package.json`). Do these
steps in order; ask the user only the questions listed.

1. Run `npm install` in the plugin root (installs `ws`, the only dependency).
2. Ask the user, one at a time:
   a. GitHub org name.
   b. The DEFAULT repo for issues when routing is uncertain (owner/name).
   c. The NOTES repo where transcripts and frame screenshots will be committed (owner/name).
      Explain: meeting artifacts live in a `docs/meetings/<meeting-id>/` folder there.
   d. Their Deepgram API key (or confirm DEEPGRAM_API_KEY is already exported).
   e. What to call them in transcripts (default "Operator" — better: their first name).
3. Offer to build the repo roster automatically: run
   `gh repo list <org> --limit 30 --json name,description` and turn each row into
   `{ "name": "<org>/<name>", "hint": "<description>" }`. Let the user trim the list.
4. Write `~/.0latency/config.json` (create the directory) with exactly these keys:
   `org`, `default_repo`, `notes_repo`, `repos`, `deepgram_key` (empty string if they use
   the env var), `operator_label`, `creation` ("auto" unless they ask for review),
   `execution` ("off"), `models` ({"events":"sonnet","summary":"sonnet"}),
   `caps` ({"events":20,"summary":2}), `idle_stop_min` (20), `max_meeting_h` (3),
   `port` (8788).
5. Clone the notes repo shallow: `git clone --depth 1 https://github.com/<notes_repo>.git
   ~/.0latency/notes/<repo-name>` (skip if the directory already exists).
6. Run `node engine/preflight.js` from the plugin root and show the user the output.
   If anything FAILs, explain the fix from the check's detail text and stop.
7. Tell the user: "Setup complete. Start a meeting with /0l:start <meeting title>."
