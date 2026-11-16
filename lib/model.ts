// Token Radar, model "radar-2": one sealed snapshot in, one ranked board out.
//
// The board ranks every protocol in the snapshot that records no token and is
// not an exchange, a bridge, a staking product or a versioned pool of another
// protocol. That is the snapshot's 40-protocol watchlist (the floor, never a
// ceiling) plus every other protocol that passes the same rule, whatever its
// TVL. Protocols whose token already trades are never ranked: they are shown
// separately, at the market's own value, in the dashboard's Live view.
//
// Implied value is derived only from the snapshot's own figures. No protocol
// name is ever special-cased; the same function scores every row:
//
//   comparable = median(market cap / TVL) over the live-token protocols in
//                THIS snapshot (ratios in (0, 20], to drop broken outliers).
//                For the 2026-11-14 snapshot that median is 0.2042, so a
//                pre-token protocol is valued at about a fifth of its TVL
//                before the adjustments below, exactly as the live market
//                values comparable protocols that already trade.
//   base       = tvl_usd x comparable
//   growth     = clamp(change_7d, -50, +100) per cent (null counts as 0)
//   growthMult = 1 + 0.8 x growth / 100            (range 0.60 .. 1.80)
//   maturity   = 0.55 + 0.45 x min(age_days, 1460) / 1460
//                (age_days = as_of - listed_at; unknown age counts as 365
//                days, the middle of the range, never as zero or as old)
//   breadth    = 1 + 0.02 x min(chains - 1, 5)     (range 1.00 .. 1.10:
//                a protocol live on several chains has stickier TVL)
//   implied    = max(1, round(base x growthMult x maturity x breadth))
//
// Why these weights: TVL is the only size the snapshot measures, so it sets
// the scale; a 7-day move is noisy, so it moves value by at most -40%/+80%
// and is clamped against the snapshot's own outliers (one protocol is up
// 4,448% in 7 days); time with no token is the patience premium the bounty
// asks for, worth at most +45% over a four-year record; chain breadth is a
// small tie-breaker, never the story. The dashboard states the formula and
// shows the worked numbers for every row, so any reader can re-derive a rank.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants. `base_multiple` is filled in per snapshot by comparableMultiple(). */
export interface ModelConstants {
  base_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  breadth_step: number;
  breadth_cap: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.2, // placeholder: replaced at run time by comparableMultiple(snapshot)
  growth_weight: 0.8,
  growth_floor: -50,
  growth_cap: 100,
  maturity_floor: 0.55,
  maturity_range: 0.45,
  maturity_days: 1460,
  unknown_age_days: 365,
  breadth_step: 0.02,
  breadth_cap: 5,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-2';

/** How many live-token protocols the dashboard's Live view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row (farm plan rendered from the board). */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  watchlist: boolean;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/**
 * The base multiple, derived from the snapshot itself: the median market-cap /
 * TVL ratio of the protocols in this snapshot whose token already trades.
 * Ratios outside (0, 20] are dropped as broken records (a $6.6M-TVL protocol
 * with a $2.6B market cap is not a comparable). Falls back to 0.2, the value
 * this snapshot's median rounds to, only if the snapshot holds no usable live
 * protocol at all.
 */
export function comparableMultiple(snapshot: Snapshot): number {
  const ratios = snapshot.protocols
    .filter((p) => p.mcap_usd !== null && p.tvl_usd > 0)
    .map((p) => (p.mcap_usd as number) / p.tvl_usd)
    .filter((r) => r > 0 && r <= 20)
    .sort((a, b) => a - b);
  if (ratios.length === 0) return 0.2;
  const mid = Math.floor(ratios.length / 2);
  return ratios.length % 2 === 1 ? ratios[mid]! : (ratios[mid - 1]! + ratios[mid]!) / 2;
}

/** The multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  baseMultiple: number,
  model: ModelConstants,
): { implied: number; base: number; growthPct: number; growthMult: number; maturityMult: number; breadthMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor +
    (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const breadthMult = 1 + model.breadth_step * Math.min(Math.max(protocol.chains.length - 1, 0), model.breadth_cap);
  const base = protocol.tvl_usd * baseMultiple;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * breadthMult));
  return { implied, base, growthPct, growthMult, maturityMult, breadthMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories that are a wrapped, staked or bridged product of a token that already trades. */
const PRODUCT_CATEGORIES = new Set([
  'cex',
  'bridge',
  'canonical bridge',
  'cross chain bridge',
  'liquid staking',
  'liquid restaking',
  'restaked btc',
]);

/** Exchange names a protocol name must not begin with. */
const EXCHANGE_PREFIXES = ['binance', 'coinbase', 'bybit', 'kraken', 'bitget', 'okx', 'bitfinex', 'gemini'];

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol is one the board may rank: pre-token, not an exchange,
 * bridge or staking product, not a versioned pool, and not a wrapped/staked
 * product by name. The watchlist's own rows are always ranked regardless:
 * the house already applied this rule to name them.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && PRODUCT_CATEGORIES.has(p.category.toLowerCase())) return false;
  if (VERSIONED.test(p.name)) return false;
  const words = p.name.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 0);
  if (words.some((w) => w === 'wrapped' || w === 'staked' || w === 'staking')) return false;
  const lower = p.name.toLowerCase();
  if (EXCHANGE_PREFIXES.some((x) => lower.startsWith(x))) return false;
  return true;
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const baseMultiple = comparableMultiple(snapshot);
  const effective: ModelConstants = { ...model, base_multiple: baseMultiple };
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug on it, unconditionally.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other rankable pre-token protocol, whatever its
  // TVL. A chosen protocol stays chosen; nothing here replaces a watchlist row.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, baseMultiple, effective);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token' as const,
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      base_multiple: round6(baseMultiple),
      growth_pct: round4(s.growthPct),
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      breadth_multiplier: round4(s.breadthMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The native gas token of a chain, for the chains the snapshot names most; anything else is named generically. */
const GAS_TOKEN: Record<string, string> = {
  Ethereum: 'ETH', Arbitrum: 'ETH', Optimism: 'ETH', Base: 'ETH', Unichain: 'ETH', Ink: 'ETH',
  Linea: 'ETH', Scroll: 'ETH', Blast: 'ETH', Mode: 'ETH', Zora: 'ETH', 'zkSync Era': 'ETH',
  Solana: 'SOL', Bitcoin: 'BTC', 'Binance': 'BNB', Polygon: 'POL', Avalanche: 'AVAX',
  Tron: 'TRX', Sui: 'SUI', Aptos: 'APT', Near: 'NEAR', Cosmos: 'ATOM', Starknet: 'STRK',
  Fantom: 'FTM', Sonic: 'S', Gnosis: 'xDAI', Celo: 'CELO', Sei: 'SEI', Berachain: 'BERA',
  Monad: 'MON', Hyperliquid: 'HYPE', 'Hyperliquid L1': 'HYPE',
};

function gasToken(chain: string): string {
  return GAS_TOKEN[chain] ?? "the chain's native gas token";
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 250;
  if (p.tvl_usd >= 100_000_000) return 150;
  return 75;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 90;
  if (age < 365) return 60;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return `Supply $${capital} of USDC to ${name} on ${chain} as collateral and borrow a small amount against it.`;
  }
  if (c.includes('dex') || c.includes('leveraged farm') || c.includes('liquidity manager')) {
    return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} in a tight range and keep the position open.`;
  }
  if (c.includes('yield aggregator') || c.includes('yield') || c.includes('farm') || c.includes('vault')) {
    return `Deposit $${capital} of USDC into ${name}'s highest-TVL vault on ${chain} and keep the receipt tokens.`;
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) {
    return `Deposit $${capital} of USDC as margin on ${name} on ${chain} and open one small hedged position.`;
  }
  if (c.includes('prediction')) {
    return `Fund $${capital} on ${name} and take one small position in a market that settles after 7 days.`;
  }
  if (c.includes('curator') || c.includes('allocator') || c.includes('restak') || c.includes('staking pool')) {
    return `Deposit $${capital} into a ${name} vault on ${chain} and keep the vault shares in your wallet.`;
  }
  if (c.includes('rwa')) {
    return `Mint $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it in your wallet.`;
  }
  if (c.includes('stable')) {
    return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold the receipt.`;
  }
  if (c.includes('insurance')) {
    return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  }
  if (c.includes('chain') || c.includes('payments') || c.includes('card')) {
    return `Bridge $${capital} of USDC onto ${chain} through its official bridge and use it in ${name}'s flagship app.`;
  }
  if (c.includes('basis')) {
    return `Deposit $${capital} of USDC into ${name}'s basis vault on ${chain} and keep the position open.`;
  }
  if (c.includes('interest rate')) {
    return `Deposit $${capital} of USDC into ${name} on ${chain} and fix the rate on one tranche.`;
  }
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** A second, different touchpoint on the same protocol, so the wallet shows more than one action. */
function secondActionFor(p: SnapshotProtocol, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('dex') || c.includes('liquidity manager')) return `Swap a small amount through ${name}'s router on ${chain} and vote once if it runs a vote.`;
  if (c.includes('lend') || c.includes('cdp')) return `Repay part of the borrow once, then re-supply, so the wallet shows a full borrow cycle on ${name}.`;
  if (c.includes('prediction')) return `Resolve one market outcome on ${name} and claim the winnings to your wallet.`;
  if (c.includes('chain') || c.includes('payments')) return `Send one small payment through ${name} on ${chain} to a second wallet you control.`;
  return `Use a second feature of ${name} on ${chain}, such as a swap, a stake, a vote or a second pool.`;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time.
 * The plan is derived from the protocol's own record (category, chains, TVL,
 * age), never from a hand-written list of names. Nothing here is a promise of
 * an airdrop: the steps position a wallet, they do not guarantee a token.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const gas = gasToken(chain);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  const second = secondActionFor(p, chain);
  return [
    {
      text: 'Use a fresh wallet that holds only the funds you plan to farm, write its seed phrase on paper and keep it offline, and never reuse that wallet on another protocol.',
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: second,
      cost: 'about $2 of gas',
      time: '10 minutes',
    },
    {
      text: `Make one qualifying action each week on ${p.name}, such as a deposit, a borrow, a swap or a vote, and keep about $${capital >= 150 ? 10 : 5} of ${gas} in the wallet for gas.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot, and do not withdraw and re-deposit just to look active.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you claim anything, open ${p.name}'s own points or rewards page from a link the protocol itself publishes, check the contract address matches, and never pay a fee or connect to a claim site a stranger sends you.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet address, the dates and every transaction hash in a farm log, note the unlock or unstaking period, and unwind in the reverse order you entered so nothing is left locked.`,
      cost: 'nothing but the log',
      time: '5 minutes to log, plus the exit',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow, watchlist: Set<string>): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    watchlist: watchlist.has(row.slug),
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model: { ...model, base_multiple: round6(comparableMultiple(snapshot)) },
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map((r) => radarRow(r, new Set(snapshot.watchlist))),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.trim().length < 20 || s.trim().length > 600) return `${r.slug} has a farm step of ${s.trim().length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
