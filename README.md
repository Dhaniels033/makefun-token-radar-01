# Token Radar — token-radar-01

[![token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/c/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Dhaniels033/makefun-token-radar-01/rank.svg)](https://make.fun/c/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Dhaniels033/makefun-token-radar-01/reward.svg)](https://make.fun/c/token-radar-01)

> **Badge placeholder:** `Dhaniels033/makefun-token-radar-01` above is a placeholder.
> It must be replaced with the real GitHub owner and repository name after the
> public repo is created (make.fun requires the three live badges with no
> placeholders). Do not submit with the placeholder still in place.

A token launch radar for the make.fun bounty
[token-radar-01](https://make.fun/c/token-radar-01): every protocol in the
sealed DefiLlama snapshot (2026-11-14, 758 protocols) that **records no token**,
ranked by what its token would be worth if its record stayed as it is — plus a
concrete seven-step farm plan for each one.

## What it ranks

- **197 rows**: all **40** protocols on the snapshot's watchlist (TVL ≥
  $50,000,000, no token recorded, not a wrapped/staked/bridged product), plus
  **157** further pre-token protocols below the floor that pass the same rule.
  Exchanges, bridges, staking products and versioned pools (`Name V2`) are
  excluded: they are products of a token that already trades, not protocols
  still waiting on a launch of their own.
- **Top 3 by implied value** (from the 2026-11-14 snapshot): Steakhouse
  Financial ($436M), Sentora Curator ($411M), Gauntlet ($266M).
- Protocols whose token already trades are **not ranked**. The largest 24 by
  market cap are shown separately in the dashboard's "Already trading" view —
  they are the comparables the board is priced from.

## The value model (radar-2)

`implied = TVL × comparable × growth × maturity × breadth`, derived only from
the snapshot's own figures — no protocol name is ever special-cased:

| Factor | Definition |
| --- | --- |
| **Comparable** | Median market-cap / TVL of the live-token protocols in *this* snapshot (ratios outside 0–20 dropped as broken records). For this snapshot: **0.2042**. A pre-token protocol is valued at about a fifth of its TVL before adjustments — exactly how the live market values comparable protocols that already trade. |
| **Growth** | 7-day TVL change, clamped to −50%..+100% (null = 0), weighted 0.8: `1 + 0.8 × growth / 100`. Range 0.60–1.80. |
| **Maturity** | `0.55 + 0.45 × min(age, 1460d) / 1460`, where age is snapshot date minus the day DefiLlama began tracking the protocol. Unknown age counts as 365 days. Time with no token is the patience premium. |
| **Breadth** | `1 + 0.02 × min(chains − 1, 5)`. Multi-chain TVL is stickier; a tie-breaker, never the story. |

The dashboard states the formula, shows the worked numbers for every row, and
works rank #1 through in full on the page. Full derivation and rationale are
in the header comment of `lib/model.ts`.

"Records no token" means DefiLlama's record carries no token for the
protocol — it is not proof that none exists. Nothing here predicts whether or
when a token is issued, and an implied value is this entry's own claim, never
one make.fun makes. Farm plans position a wallet; they do not guarantee a
token, an airdrop, or any payout.

## The dashboard

Static page, no framework, no network: `dashboard/index.html` + `app.css` +
`app.js`, fed by `data.js` (written by `main.ts` from the same board — no
fetch). Features:

- Ranked table with search (name / slug / category / chain), category and
  chain filters, watchlist-only toggle, and sorting by implied value, TVL,
  7-day change, age, or name.
- Detail view per protocol (click any row, or open `#p=<slug>`): the model's
  worked numbers and the seven-step farm plan, each step with its cost and time.
- "Already trading" tab: the live-token comparables, priced at the market's
  own values.
- State lives in the URL hash (`#q=…&cat=…&watch=1&p=<slug>`), so a filtered
  board or a detail view is a link.

## Running it locally

Requires Node 22 (the entry runs as erasable TypeScript under `node main.ts`,
standard library only, no install, no network at run time):

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
# writes out/board.json, out/data.js, out/dashboard/, out/screenshots/, out/dossier.json
```

The run is deterministic: the same snapshot bytes always produce the same
output bytes (no clock, no randomness, no network), so the grader's two runs
agree byte for byte. `main.ts` refuses to write a board the gate would refuse
(watchlist coverage, ranks 1..N, non-increasing implied value, 3–12 farm
steps of 20–600 characters each).

## Screenshots

`screenshots/1-board.jpg` (board), `2-detail.jpg` (detail view),
`3-filtered.jpg` (filtered board) are real screenshots of this dashboard at
1440×900, taken with headless Chromium against the locally generated
`/output`. To regenerate after changing the dashboard:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
chromium --headless=new --disable-gpu --no-sandbox --screenshot=screenshots/1-board.jpg \
  --window-size=1440,900 --hide-scrollbars --virtual-time-budget=3000 "file://$PWD/out/dashboard/index.html"
chromium --headless=new --disable-gpu --no-sandbox --screenshot=screenshots/2-detail.jpg \
  --window-size=1440,900 --hide-scrollbars --virtual-time-budget=3000 "file://$PWD/out/dashboard/index.html#p=steakhouse-financial"
chromium --headless=new --disable-gpu --no-sandbox --screenshot=screenshots/3-filtered.jpg \
  --window-size=1440,900 --hide-scrollbars --virtual-time-budget=3000 "file://$PWD/out/dashboard/index.html#cat=Lending&watch=1"
# then re-run main.ts so /output/dossier.json is rebuilt from the new shots,
# and convert to JPEG ≤512 KiB each if the PNGs are over the cap.
```

(The screenshots in this repo were produced with Playwright's bundled
Chromium; any headless Chromium works. The detail shot uses the rank-#1 slug,
`steakhouse-financial`.)

## Pre-submit check

From inside the unpacked kit:

```sh
node cli/makefun.mjs check --kit . --repo <your repository> --transcripts transcripts.tar.gz
```

## Layout

| Path | What it is |
| --- | --- |
| `main.ts` | Entrypoint: snapshot in, board + data + dashboard + dossier out. |
| `lib/model.ts` | The radar-2 model, farm plans, snapshot parsing, board validation. |
| `vendor/makefun-board.ts` | make.fun's dossier library, copied unchanged from the kit. |
| `dashboard/` | The static page (`index.html`, `app.css`, `app.js`). |
| `screenshots/` | Three real screenshots of the dashboard. |
| `.makefun/owner.json` | Claim file: the owner's linked Solana wallet. |
| `LICENSE` | MIT. |

## Prize

$1,325 in total (1st $1,000; 2nd–5th $50; 6th–10th $25), paid in USDC on
Solana. Deadline: Mon Dec 14, 2026, 17:00 WIB (10:00 UTC).
