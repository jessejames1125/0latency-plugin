# Contributing

Thanks for looking. This is a small project maintained by one person in spare hours, so
here's an honest picture of how to work with it.

## Before you write code

**Open an issue first** for anything beyond a typo or an obvious bug fix. It's a short
conversation that saves you from building something I'd have to turn down. Bug reports
and "this didn't work on my setup" reports are genuinely the most useful contribution —
more than features.

## Getting set up

```bash
git clone https://github.com/jessejames1125/0latency-plugin.git
cd 0latency-plugin
npm install
npm test          # 60 tests, no API keys required
```

The whole suite runs offline. If a test needs a network call or a real API key, that's a
bug in the test.

To install your working copy as a live plugin, add the local directory as a marketplace
in Claude Code rather than pointing at GitHub:

```
/plugin marketplace add /absolute/path/to/0latency-plugin
/plugin install 0l
```

Run `claude plugin validate` after touching either manifest in `.claude-plugin/`.

## House rules

These aren't style preferences; they're the constraints the design depends on.

- **CommonJS.** No ESM, no TypeScript, no build step. `require`/`module.exports`.
- **One runtime dependency: `ws`.** Don't add more. If something needs a library, it
  probably needs a smaller design instead.
- **Log and continue.** A bad audio frame or a failed AI call must never crash the
  pipeline or lose events already captured. A meeting is unrepeatable.
- **The AI never acts.** The event session returns data; `engine/` performs every side
  effect with fixed command shapes. Don't route a side effect through the model.
- **`--dangerously-skip-permissions` never appears.** A test enforces this. Don't work
  around the test.
- **Windows is a first-class platform.** It's the primary development environment. Watch
  for path handling and process spawning differences; CI runs on both Windows and Linux.

## Tests

Every change to `engine/` needs a test. The suite uses `node --test` — no framework, no
config. Match the existing style in `test/`: plain assertions, real modules, fakes only
at the process and network boundary.

```bash
npm test
node --test test/gate.test.js    # a single file
```

## Before you push

```bash
npm test
bash scripts/leak-check.sh
```

`leak-check.sh` scans tracked files for content that shouldn't be in a public repo —
credentials, private keys, and a few local patterns. Install it as a pre-push hook once:

```bash
bash scripts/install-hooks.sh
```

## Commits and PRs

Small and focused beats large and comprehensive. Conventional-ish prefixes
(`feat:`, `fix:`, `docs:`, `test:`, `chore:`) are used throughout the history — please
match. In the PR, say what changed and how you verified it.

## Licensing

Contributions are accepted under [Apache-2.0](LICENSE), the same license as the project.
By opening a pull request you're agreeing to that.
