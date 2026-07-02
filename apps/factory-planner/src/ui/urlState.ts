// Mirrors the current PersistedState into the URL's query string (?s=...) so a
// configuration can be bookmarked or shared as a link. Read once on mount; written on every
// state change thereafter. Best-effort: any failure (unsupported API, corrupt param) is ignored.

import type { PersistedState } from "./persist";

const PARAM = "s";

function encode(json: string): string {
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decode(param: string): string {
  const b64 = param.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Reads and decodes the `?s=` param, if present and well-formed. */
export function readStateFromUrl(): Partial<PersistedState> | null {
  try {
    const s = new URLSearchParams(window.location.search).get(PARAM);
    if (!s) return null;
    const parsed = JSON.parse(decode(s));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/** Replaces the `?s=` param (and only that param) with the current state, without adding history entries. */
export function writeStateToUrl(state: PersistedState): void {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set(PARAM, encode(JSON.stringify(state)));
    window.history.replaceState(null, "", url.toString());
  } catch {
    /* ignore */
  }
}
