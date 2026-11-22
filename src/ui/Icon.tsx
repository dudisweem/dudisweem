// One stroke icon family (1.8 stroke), ported from the approved prototype sprite.
const PATHS = {
  "home": "<path d=\"M3 10.5 12 3l9 7.5\"/><path d=\"M5 9.5V20h14V9.5\"/><path d=\"M10 20v-5h4v5\"/>",
  "kids": "<circle cx=\"9\" cy=\"8\" r=\"3.2\"/><path d=\"M3.5 20c.6-3.4 2.8-5.4 5.5-5.4s4.9 2 5.5 5.4\"/><circle cx=\"17\" cy=\"9.5\" r=\"2.5\"/><path d=\"M15.5 14.6c2.4.2 4.2 2 4.8 5.4\"/>",
  "cal": "<rect x=\"3.5\" y=\"5\" width=\"17\" height=\"15.5\" rx=\"2.5\"/><path d=\"M3.5 10h17M8 3v4M16 3v4\"/>",
  "heart": "<path d=\"M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20Z\"/><path d=\"M6 12h3l1.5-2.5 2 5 1.5-2.5h4\"/>",
  "plus": "<path d=\"M12 5v14M5 12h14\"/>",
  "check": "<path d=\"m5 12.5 4.5 4.5L19 7.5\"/>",
  "x": "<path d=\"M6 6l12 12M18 6 6 18\"/>",
  "clock": "<circle cx=\"12\" cy=\"12\" r=\"8.5\"/><path d=\"M12 7.5V12l3 2\"/>",
  "user": "<circle cx=\"12\" cy=\"8\" r=\"3.6\"/><path d=\"M5 20c.8-3.8 3.6-6 7-6s6.2 2.2 7 6\"/>",
  "pin": "<path d=\"M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11Z\"/><circle cx=\"12\" cy=\"10\" r=\"2.3\"/>",
  "alert": "<path d=\"M12 4 2.8 19.5h18.4L12 4Z\"/><path d=\"M12 10v4.5M12 17.2v.1\"/>",
  "card": "<path d=\"M3.5 8.5V6h17v2.5a2.5 2.5 0 0 0 0 5V16h-17v-2.5a2.5 2.5 0 0 0 0-5Z\"/><path d=\"M14 6v10\" stroke-dasharray=\"2 2\"/>",
  "chart": "<path d=\"M4 20h16M7 16v-5M12 16V7M17 16v-8\"/>",
  "inbox": "<path d=\"M3.5 13.5 6 5h12l2.5 8.5V19h-17v-5.5Z\"/><path d=\"M3.5 13.5H9a3 3 0 0 0 6 0h5.5\"/>",
  "waves": "<path d=\"M3 8c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0M3 13c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0M3 18c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0\"/>",
  "search": "<circle cx=\"11\" cy=\"11\" r=\"6.5\"/><path d=\"m16 16 4 4\"/>",
  "left": "<path d=\"M14.5 6 8.5 12l6 6\"/>",
  "right": "<path d=\"m9.5 6 6 6-6 6\"/>",
  "pen": "<path d=\"M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z\"/>",
  "lock": "<rect x=\"5\" y=\"10.5\" width=\"14\" height=\"10\" rx=\"2.5\"/><path d=\"M8 10.5V8a4 4 0 0 1 8 0v2.5\"/>",
  "refresh": "<path d=\"M19.5 12a7.5 7.5 0 1 1-2.2-5.3L19.5 9\"/><path d=\"M19.5 4v5h-5\"/>",
  "wallet": "<rect x=\"3.5\" y=\"6\" width=\"17\" height=\"13\" rx=\"2.5\"/><path d=\"M16 12.5h1.5M3.5 9.5h17\"/>",
  "cash": "<rect x=\"2.5\" y=\"6.5\" width=\"19\" height=\"11\" rx=\"2\"/><circle cx=\"12\" cy=\"12\" r=\"2.6\"/>",
  "mail": "<rect x=\"3.5\" y=\"5.5\" width=\"17\" height=\"13\" rx=\"2.5\"/><path d=\"m4 7 8 6 8-6\"/>",
  "send": "<path d=\"M20 4 3.5 10.5l7 2.5 2.5 7L20 4Z\"/><path d=\"m10.5 13 4-4\"/>",
  "flag": "<path d=\"M5 21V4M5 4h11l-2 4 2 4H5\"/>",
  "eye": "<path d=\"M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z\"/><circle cx=\"12\" cy=\"12\" r=\"2.8\"/>",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, small, className }: { name: IconName; small?: boolean; className?: string }) {
  return (
    <svg className={["ic", small ? "s" : "", className ?? ""].join(" ").trim()} viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: PATHS[name] }} />
  );
}
