import { useState } from "react";
import type { Setup } from "../ui/persist";

interface Props {
  setups: Setup[];
  activeId: string;
  onSwitch: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

export function SetupBar({ setups, activeId, onSwitch, onCreate, onRename, onDelete }: Props) {
  const active = setups.find((s) => s.id === activeId) ?? setups[0];
  const [copied, setCopied] = useState(false);

  function copyLink() {
    navigator.clipboard?.writeText(window.location.href).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => { /* clipboard unavailable/denied — link is still current in the address bar */ },
    );
  }

  function remove() {
    if (setups.length <= 1) return;
    if (window.confirm(`Delete setup "${active.name}"? This can't be undone.`)) onDelete(active.id);
  }

  return (
    <section className="panel setup-bar">
      <span className="onsite-label">Setup:</span>
      <select value={activeId} onChange={(e) => onSwitch(e.target.value)} aria-label="Active setup">
        {setups.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
      <input
        type="text"
        className="setup-name"
        value={active.name}
        onChange={(e) => onRename(active.id, e.target.value)}
        aria-label="Rename active setup"
      />
      <button className="chip-btn" onClick={onCreate} title="Save the current settings as a new setup">
        New
      </button>
      <button
        className="chip-btn"
        onClick={remove}
        disabled={setups.length <= 1}
        title={setups.length <= 1 ? "At least one setup must remain" : `Delete "${active.name}"`}
      >
        Delete
      </button>
      <button className="chip-btn" onClick={copyLink} title="Copy a shareable link with the current settings">
        {copied ? "Copied!" : "Copy Link"}
      </button>
    </section>
  );
}
