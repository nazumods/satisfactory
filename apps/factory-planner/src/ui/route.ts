// Minimal hash routing (GitHub Pages serves from a subpath, so no history routing).

import { useEffect, useState } from "react";

/** Current hash route without the leading '#', e.g. "/balancer/120:48,72". */
export function useHashRoute(): string {
  const [route, setRoute] = useState(() => window.location.hash.replace(/^#/, ""));
  useEffect(() => {
    const onChange = () => setRoute(window.location.hash.replace(/^#/, ""));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

export function navigate(route: string, replace = false) {
  if (replace) {
    window.history.replaceState(null, "", `#${route}`);
    // replaceState doesn't fire hashchange; let listeners re-read the hash.
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else {
    window.location.hash = route;
  }
}
