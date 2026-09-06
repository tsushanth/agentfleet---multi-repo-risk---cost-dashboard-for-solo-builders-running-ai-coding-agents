# AgentFleet — Local MVP Scaffold Plan

## Goal of this MVP

Prove the core value loop locally, with no server, no accounts, no deploy:

> Point the tool at a handful of local git repos → it aggregates recent commits,
> flags likely agent-authored risk (secrets, risky shell commands, unreviewed
> dependency bumps), shows a rough token/cost tally per project, and prints a
> "review queue" of only the commits that actually need a human look.

Everything below is scoped to make that loop runnable and checkable on a laptop
in one sitting — not to be a real product yet.

## 1. Stack choice

**Plain Node.js, no TypeScript, no framework, no npm dependencies.**

- Node's built-in modules only: `fs`, `path`, `child_process` (to shell out to
  the system `git` binary for `log`/`diff`/`show`), and `node:test` for
  verification.
- A single CLI entry point (`cli.js`) with a few subcommands (`scan`, `digest`,
  `cost`). No `commander`/`yargs` — `process.argv` parsing is trivial at this
  scale.
- No build step (no tsc/webpack/bundler) — `node cli.js <command>` just runs.

**Why this over alternatives:**
- A Python script would be equally light, but the real product's eventual
  integration point (parsing Claude Code's own local session logs, git
  plumbing) is more naturally JS/TS-adjacent and keeps future overlap with a
  real web dashboard cheap. Since Node ships everywhere Claude Code already
  runs, zero install friction.
- A Go single-binary is appealing long-term (easy distribution) but adds a
  compile step and is overkill to prove the idea; revisit for a real build.
- Explicitly rejecting any framework (Next.js, Express, etc.) — there is no
  server and no UI in this MVP, so a framework would add pure ceremony.

## 2. Explicitly scoped OUT

Not needed to demonstrate the core value locally — skip all of these:

- **Auth / accounts / multi-user** — single local user, no login.
- **Billing / pricing enforcement** — pricing is a business-model detail, not
  part of the demo.
- **Hosting / deployment / CI** — this runs on `localhost` via the CLI only.
- **A real web UI/dashboard** — output is a generated Markdown/JSON file and
  terminal output, not a rendered app. (A dashboard is the eventual product,
  but the *value* — risk flags + digest + cost rollup — is provable without
  rendering it as a UI.)
- **Real GitHub/GitLab API integration** — repos are read directly off local
  disk via `git`, not fetched from a remote host.
- **Real Claude API billing data** — actual per-token cost pulled from
  Anthropic's billing API is out of scope; cost tracking reads a local
  sample/fixture log (shaped like what a real integration would produce) so
  the aggregation logic is provable without live credentials.
- **ML-based/LLM-based secret or code review** — detection is regex/heuristic
  based (known secret patterns, known risky shell idioms like
  `curl | bash`, `rm -rf /`, `chmod 777`, hardcoded API key patterns, changed
  lockfile/manifest entries). Good enough to prove the "flag risky diffs"
  loop; a real product would likely add an LLM-based reviewer later.
- **Scheduling/automation** ("weekly" digest) — the CLI takes a `--since`
  window as an argument; nothing runs on a timer.

## 3. File/directory layout

```
agentfleet/
  cli.js                     # entry point; dispatches `scan`, `digest`, `cost` subcommands
  lib/
    repos.js                 # discover configured repos, run `git log`/`git diff` via child_process
    secretScan.js            # regex rules: leaked secrets, risky shell commands
    depScan.js               # detect changed dependency manifests/lockfiles in a diff
    digest.js                # build the weekly digest + review queue from scan results
    cost.js                  # read the sample cost log, aggregate spend per project
  config/
    repos.json                # list of local repo paths to scan (points at fixtures/ by default)
    cost-log.sample.json      # mock per-project token/cost entries, shaped like a real export
  fixtures/
    demo-repo-a/              # tiny local git repo, seeded with a commit containing
                               #   a fake leaked API key + a `curl | bash` line
    demo-repo-b/               # tiny local git repo, seeded with a normal commit
                               #   plus a package.json dependency bump
  test/
    secretScan.test.js        # node:test — regex rules catch/skip the right fixture lines
    digest.test.js            # node:test — digest correctly separates "needs review" vs. clean
  output/                     # gitignored; digest.md / review-queue.json written here per run
  README.md                   # how to run the demo, in ~5 commands
```

No `package.json` dependencies are required (only `"type": "module"` if using
ESM `import`, or plain CommonJS `require` — either works with zero installs).

## 4. Verification

**Automated:**
- `node --test test/` — runs the built-in test runner against `secretScan.js`
  and `digest.js` using the seeded fixtures. Asserts: the fake secret and the
  `curl | bash` line are flagged; the clean commit in `demo-repo-b` is not
  flagged but its dependency bump *is* surfaced as "unreviewed dependency
  change"; the review queue contains exactly the commits expected.

**Manual run-through (the actual demo script):**
```
node cli.js scan --config config/repos.json
node cli.js digest --since 7d --out output/digest.md
node cli.js cost --config config/cost-log.sample.json
cat output/digest.md
```
Expected observable result: `output/digest.md` lists both fixture repos, shows
`demo-repo-a`'s commit flagged under a "Needs Review" section with the reason
(leaked secret / risky shell command), shows `demo-repo-b`'s dependency bump
flagged separately, and prints a per-project cost rollup table from the sample
cost log. This is the whole core loop, provable without any network call,
account, or deployment.
