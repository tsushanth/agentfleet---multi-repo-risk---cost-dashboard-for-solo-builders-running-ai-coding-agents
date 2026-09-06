# AgentFleet (local MVP)

A local proof of the core value loop for solo builders running Claude Code
(or similar) across many repos at once:

> Point the tool at a handful of local git repos → it aggregates recent
> commits, flags likely agent-authored risk (leaked secrets, risky shell
> commands, unreviewed dependency bumps), shows a rough token/cost tally per
> project, and prints a "review queue" of only the commits that actually
> need a human look.

This is **not** the real product — no server, no accounts, no deploy, no
network calls. It's a CLI that runs entirely on your laptop against real
local git repos, to prove the aggregation + risk-flagging + cost-rollup
logic before building a hosted dashboard around it. See `../plan.md` for the
full scope and what's deliberately left out.

## Stack

Plain Node.js (built-in `fs`, `path`, `child_process`, `node:test`). No
npm dependencies, no build step, no TypeScript.

## Setup

```
node fixtures/seed.js
```

This creates two tiny local git repos under `fixtures/` that the demo scans:

- **demo-repo-a** — has a commit that looks like an agent quietly added a
  deploy script containing a hardcoded AWS key, a hardcoded Stripe key, a
  `curl | bash` line, and a `chmod 777`.
- **demo-repo-b** — has a clean init commit, a commit that bumps the
  `left-pad` dependency in `package.json`, and a clean docs commit.

(These repos are generated rather than committed to this repo, since git
can't cleanly track one repo's full history nested inside another — it only
stores a dangling reference. The seed script is idempotent; re-running it
is a no-op once the repos exist.)

## Run the demo

```
node cli.js scan --config config/repos.json
node cli.js digest --since 7d --out output/digest.md
node cli.js cost --config config/cost-log.sample.json
cat output/digest.md
```

Expected result:

- `scan` prints, per repo, how many commits were found in the window and how
  many were flagged.
- `digest` writes `output/digest.md` (a full report split into **Needs
  Review — Security**, **Dependency Changes — Unreviewed**, and **Clean**
  sections) and `output/review-queue.json` (just the commits that need a
  human look, each with its reasons) — this is the "queue only what matters"
  half of the value loop.
- `cost` prints a per-project token/spend rollup table, read from the sample
  cost log in `config/cost-log.sample.json` (a stand-in for a real Anthropic
  billing export — no live API/billing integration in this MVP).

## Commands

| Command | Flags | Purpose |
|---|---|---|
| `scan` | `--config <path>` (default `config/repos.json`), `--since <Nd>` (default `30d`) | Discover configured repos, run the risk/dependency scan, print a per-repo summary. |
| `digest` | `--config <path>`, `--since <Nd>` (default `7d`), `--out <path>` (default `output/digest.md`) | Build the full digest + review queue and write them to disk. |
| `cost` | `--config <path>` (default `config/cost-log.sample.json`) | Aggregate and print token/spend per project from a local cost log. |

`--since` takes a simple `<N>d` window, e.g. `7d`, `30d`.

## Pointing it at your own repos

Edit `config/repos.json` to list any local git repo paths:

```json
{
  "repos": [
    { "name": "my-ios-app", "path": "/Users/you/code/my-ios-app" }
  ]
}
```

Risk/dependency detection is regex/heuristic-based (known secret patterns,
known risky shell idioms, changed lockfile/manifest entries) — not an LLM
review. See `lib/secretScan.js` and `lib/depScan.js` for the exact rules.

## Tests

```
npm test
```

Runs `node --test` against `test/secretScan.test.js` and `test/digest.test.js`,
which seed the fixtures automatically and assert: the fake secret and the
`curl | bash` line in `demo-repo-a` are flagged; `demo-repo-b`'s clean commits
are not flagged for secrets/shell risk; its dependency changes are surfaced
separately; and the review queue contains exactly the commits that need a
look.

## Layout

```
agentfleet/
  cli.js                     # entry point: scan / digest / cost
  lib/
    repos.js                 # discover repos, shell out to git log/show
    secretScan.js            # regex rules: leaked secrets, risky shell commands
    depScan.js               # detect changed dependency manifests/lockfiles
    digest.js                # build the digest + review queue from scan results
    cost.js                  # aggregate the sample cost log per project
  config/
    repos.json                # local repo paths to scan
    cost-log.sample.json      # mock per-project token/cost entries
  fixtures/
    seed.js                   # generates demo-repo-a / demo-repo-b on demand
  test/
    secretScan.test.js
    digest.test.js
  output/                     # gitignored; digest.md / review-queue.json land here
```
