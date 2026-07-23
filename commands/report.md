---
description: Report a 0latency bug — files a GitHub issue on the plugin repo (you review before it posts)
allowed-tools: Read, Bash(node:*), Bash(gh --version:*), Bash(gh issue create:*)
---

Help the user file a bug report against the 0l plugin. Reports go to the PUBLIC plugin repo
`jessejames1125/0latency-plugin`, so be careful with sensitive data.

1. Ask the user, briefly:
   - What went wrong? (one or two sentences)
   - What were they doing when it happened? (which command / step)
   - What did they expect vs. what actually happened?

2. Collect SAFE diagnostics automatically (these are fine to post publicly):
   - Plugin version: read `version` from the plugin root `package.json`.
   - `node --version`, and the OS (`process.platform`).
   - `gh --version` (first line).

3. **Do NOT attach the engine log, the transcript, `~/.0latency/config.json`, or any meeting
   content.** These can contain confidential company discussion, repo names, or a Deepgram key,
   and this repo is public. If the user pasted a log excerpt, scan it and strip anything that
   looks like a key, token, or private meeting text before including it. When in doubt, leave it
   out and describe the behavior instead.

4. Build the issue body from their answers plus the safe diagnostics, using this shape:

   ```
   ## What happened
   <their description>

   ## Steps
   <what they were doing>

   ## Expected vs actual
   <expected> / <actual>

   ## Environment
   - 0l version: <x>
   - node: <x>
   - os: <platform>
   - gh: <x>
   ```

5. File it with the browser-review flow so nothing posts without the user seeing it first:
   `gh issue create --repo jessejames1125/0latency-plugin --title "<short title>" --body "<body>" --web`
   This opens the prefilled new-issue page in their browser — tell them to review and click
   Submit. (If `--web` fails or they prefer, offer to run the same command without `--web` to
   file it directly, but only after they confirm the body contains nothing sensitive.)

6. Also give them the direct link in case they'd rather do it by hand:
   https://github.com/jessejames1125/0latency-plugin/issues/new
