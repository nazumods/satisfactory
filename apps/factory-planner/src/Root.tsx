import { App } from "./App";
import { BalancerView } from "./components/BalancerView";
import { useHashRoute } from "./ui/route";

/** Hash-route switch: `#/balancer/<spec>` shows the balancer, anything else the planner. */
export function Root() {
  const route = useHashRoute();
  const m = route.match(/^\/balancer(?:\/(.*))?$/);
  if (m) return <BalancerView spec={m[1] ?? ""} />;
  return <App />;
}
