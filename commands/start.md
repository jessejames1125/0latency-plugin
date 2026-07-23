---
description: Start a 0latency meeting capture (detached engine + capture tab)
allowed-tools: Bash(node:*), Read
---

Start a meeting capture. $ARGUMENTS is the meeting title (default "Untitled meeting").

1. From the plugin root (two levels up from this file), run:
   `node engine/index.js start --title "$ARGUMENTS" --detach`
2. The command prints `SESSION_DIR=...` and `ENGINE_PID=...`. Read the engine log at
   `<SESSION_DIR>/engine.log` (wait ~2s) and find the line `[0l] capture tab: http://...`.
3. Tell the user, exactly this checklist:
   - The capture tab should have opened in the browser (if not, open the URL from step 2).
   - Click **Start capture**. Grant mic access. In the share dialog pick the **Google Meet
     TAB** and check **"Also share tab audio"** — a whole-screen share carries NO audio.
   - Click the video preview any time to grab + highlight a frame.
   - The engine runs detached: this Claude session can be closed. Watch progress with
     `tail -f <SESSION_DIR>/engine.log` if curious.
   - When the meeting ends, run `/0l:finish`.
4. Do NOT keep polling the log. Report the session dir and stop.
