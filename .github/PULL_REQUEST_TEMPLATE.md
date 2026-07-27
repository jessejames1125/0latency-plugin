## What this changes

<!-- One or two sentences. Link the issue if there is one. -->

## Why

<!-- What problem does it solve? -->

## How it was verified

<!-- Say which of these you actually ran, and what happened. "npm test passes" is not the
     same as "I captured a live meeting" — be specific about which one you did. -->

- [ ] `npm test` passes
- [ ] `bash scripts/leak-check.sh` is clean
- [ ] `claude plugin validate` passes (if manifests changed)
- [ ] Verified against a live capture session

## Constraint check

- [ ] No new runtime dependencies (`ws` is the only one)
- [ ] CommonJS, no build step
- [ ] No side effect routed through the model — the engine still does the acting
- [ ] `--dangerously-skip-permissions` still absent
- [ ] New behavior in `engine/` has a test
