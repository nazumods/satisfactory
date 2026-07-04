// Deterministic per-part colors for the Layout view. Golden-angle hue spacing from a
// stable name hash so any two parts that appear together are very likely distinguishable,
// with lightness tuned for the dark theme background.

const cache: Record<string, string> = {};

export function partColor(item: string): string {
  const cached = cache[item];
  if (cached) return cached;
  let h = 0;
  for (let i = 0; i < item.length; i++) h = (h * 31 + item.charCodeAt(i)) >>> 0;
  const hue = (h * 137.508) % 360;
  const color = `hsl(${hue.toFixed(1)}, 68%, 62%)`;
  cache[item] = color;
  return color;
}
