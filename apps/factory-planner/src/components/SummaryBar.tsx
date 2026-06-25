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
  onResetAlts: () => void;
  appliedAltCount: number;
}

export function SummaryBar({
  stats,
  tier,
  onTierChange,
  onResetAlts,
  appliedAltCount,
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
        <Stat label="Alts active" value={String(appliedAltCount)} />
      </div>

      <div className="actions">
        <button
          className="btn ghost"
          onClick={onResetAlts}
          disabled={appliedAltCount === 0}
          title="Disable all alternates"
        >
          Reset alts
        </button>
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
