import { fmt, fmtPower, TIER_NAMES } from "../ui/format";

export interface SummaryStats {
  machines: number;
  power: number;
  foundations: number;
  fullMachines: number;
  fullPower: number;
  fullFoundations: number;
}

interface Props {
  stats: SummaryStats;
  tier: number;
  onTierChange: (t: number) => void;
}

export function SummaryBar({
  stats,
  tier,
  onTierChange,
}: Props) {
  const filtered = tier < 9 && stats.machines !== stats.fullMachines;

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark">⏣</span>
        <div>
          <h1>Satisfactory Factory Planner</h1>
          <p className="brand-sub">Phase 5 production chain · alternates &amp; tier planning</p>
        </div>
      </div>

      <div className="tier-control">
        <div className="tier-control-head">
          <label>Your tier</label>
          <span className="tier-badge big">{TIER_NAMES[tier]}</span>
        </div>
        <div className="tier-track" role="radiogroup" aria-label="Your tier">
          {Array.from({ length: 10 }, (_, n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={n === tier}
              className={
                "tier-node" + (n === tier ? " current" : n < tier ? " done" : "")
              }
              onClick={() => onTierChange(n)}
              title={TIER_NAMES[n]}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="topbar-right">
        <div className="stats">
          <Stat
            label="Machines"
            value={fmt(stats.machines, 0)}
            full={filtered ? fmt(stats.fullMachines, 0) : undefined}
          />
          <Stat
            label={filtered ? "Power @ tier" : "Avg power"}
            value={fmtPower(stats.power)}
            full={filtered ? fmtPower(stats.fullPower) : undefined}
          />
          <Stat
            label="Foundations"
            value={fmt(stats.foundations, 0)}
            hint="w/ clearance"
            full={filtered ? fmt(stats.fullFoundations, 0) : undefined}
          />
        </div>

        <a className="balancer-link" href="#/balancer/120:48,72" title="Belt balancer diagrams">
          ⑃ Balancer
        </a>

        <a
          className="gh-link"
          href="https://github.com/nazumods/satisfactory"
          target="_blank"
          rel="noopener noreferrer"
          title="View source on GitHub"
          aria-label="View source on GitHub"
        >
          <svg viewBox="0 0 16 16" width="22" height="22" aria-hidden="true">
            <path
              fill="currentColor"
              d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.65 7.65 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"
            />
          </svg>
        </a>
      </div>
    </header>
  );
}

function Stat({
  label,
  value,
  hint,
  full,
}: {
  label: string;
  value: string;
  hint?: string;
  full?: string;
}) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">
        {label}
        {hint && <span className="stat-hint"> · {hint}</span>}
      </div>
      {full && <div className="stat-full">of {full} full plan</div>}
    </div>
  );
}
