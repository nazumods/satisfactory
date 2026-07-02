import { useMemo, useState } from "react";
import { DEFAULT_RECIPE_BY_PRODUCT } from "../solver/model";
import { RAW_INPUTS } from "../data/recipes";
import { fmt } from "../ui/format";

interface Props {
  /** item -> limit per minute; null = unlimited. */
  supplies: Record<string, number | null>;
  onSet: (item: string, limit: number | null) => void;
  onRemove: (item: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Every producible part is eligible as a subsidy source (raw boundary feed already exists).
const CANDIDATES: string[] = Object.keys(DEFAULT_RECIPE_BY_PRODUCT)
  .filter((p) => !RAW_INPUTS.has(p))
  .sort();

export function SupplyPanel({ supplies, onSet, onRemove, open, onOpenChange }: Props) {
  const [draft, setDraft] = useState("");

  const entries = useMemo(
    () => Object.keys(supplies).sort((a, b) => a.localeCompare(b)),
    [supplies],
  );

  const available = useMemo(
    () => CANDIDATES.filter((c) => !(c in supplies)),
    [supplies],
  );

  function add(item: string) {
    const match = CANDIDATES.find((c) => c.toLowerCase() === item.trim().toLowerCase());
    if (!match || match in supplies) return;
    onSet(match, null); // default: unlimited until a limit is typed
    setDraft("");
  }

  return (
    <details
      className="panel supply-panel"
      open={open}
      onToggle={(e) => onOpenChange(e.currentTarget.open)}
    >
      <summary className="alt-head panel-summary">
        <h2>External supply</h2>
      </summary>
      <p className="alt-hint">
        Have a part already — say a byproduct from another factory? Mark it here and the planner
        draws from it before building production. Leave the limit blank for unlimited.
      </p>

      <div className="supply-add">
        <input
          type="text"
          list="supply-candidates"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add(draft);
          }}
          placeholder="Add a part to supply…"
          aria-label="Add a part to supply"
        />
        <datalist id="supply-candidates">
          {available.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <button className="chip-btn" onClick={() => add(draft)} disabled={!draft.trim()}>
          Add
        </button>
      </div>

      {entries.length === 0 ? (
        <p className="empty">No external supply yet — production covers everything.</p>
      ) : (
        <ul className="supply-list">
          {entries.map((item) => (
            <SupplyRow
              key={item}
              item={item}
              limit={supplies[item]}
              onSet={(lim) => onSet(item, lim)}
              onRemove={() => onRemove(item)}
            />
          ))}
        </ul>
      )}
    </details>
  );
}

function SupplyRow({
  item,
  limit,
  onSet,
  onRemove,
}: {
  item: string;
  limit: number | null;
  onSet: (limit: number | null) => void;
  onRemove: () => void;
}) {
  return (
    <li className="supply-row-item">
      <span className="supply-name">{item}</span>
      <div className="supply-limit">
        <input
          type="number"
          min={0}
          step="any"
          value={limit ?? ""}
          onChange={(e) => {
            const v = e.target.value.trim();
            if (v === "") return onSet(null);
            const n = Number(v);
            onSet(Number.isFinite(n) && n >= 0 ? n : null);
          }}
          placeholder="∞"
          aria-label={`${item} supply limit per minute`}
        />
        <span className="supply-unit">/min</span>
      </div>
      <span className="supply-state muted">{limit == null ? "unlimited" : `cap ${fmt(limit)}`}</span>
      <button className="supply-remove" onClick={onRemove} title={`Remove ${item}`} aria-label={`Remove ${item}`}>
        ✕
      </button>
    </li>
  );
}
