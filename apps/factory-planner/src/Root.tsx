import { App } from "./App";
import { BalancerView } from "./components/BalancerView";
import { DesignerView } from "./components/DesignerView";
import { useHashRoute } from "./ui/route";

/**
 * Hash-route switch: `#/balancer/<spec>` shows the balancer, `#/designer` the freeform
 * floor-plan designer, anything else the planner.
 */
export function Root() {
  const route = useHashRoute();
  const m = route.match(/^\/balancer(?:\/(.*))?$/);
  if (m) return <BalancerView spec={m[1] ?? ""} />;
  if (/^\/designer$/.test(route)) return <DesignerView />;
  return <App />;
}
