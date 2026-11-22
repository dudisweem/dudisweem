// Pure progress helpers: current status per skill = latest entry; grouped by category.
export type ProgressStatus = "not_started" | "practicing" | "achieved";

export const PROGRESS: Record<ProgressStatus, { label: string; kind: "done" | "wait" | "ok" }> = {
  not_started: { label: "עוד לא התחיל", kind: "done" },
  practicing: { label: "בתרגול", kind: "wait" },
  achieved: { label: "הושג", kind: "ok" },
};

export type Skill = { id: string; name: string; category: string; sort: number };
export type ProgressEntry = { skill_id: string; status: ProgressStatus; note: string; recorded_at: string };

export type SkillState = Skill & { status: ProgressStatus; note: string; at: string | null };
export type CategorySummary = { category: string; total: number; achieved: number; practicing: number; skills: SkillState[] };

/** Latest entry per skill wins (entries may arrive in any order). */
export function currentStatus(entries: ProgressEntry[]) {
  const latest = new Map<string, ProgressEntry>();
  for (const e of entries) {
    const prev = latest.get(e.skill_id);
    if (!prev || new Date(e.recorded_at).getTime() > new Date(prev.recorded_at).getTime()) latest.set(e.skill_id, e);
  }
  return latest;
}

export function summarize(skills: Skill[], entries: ProgressEntry[]): CategorySummary[] {
  const latest = currentStatus(entries);
  const byCat = new Map<string, CategorySummary>();
  for (const s of [...skills].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "he"))) {
    const e = latest.get(s.id);
    const state: SkillState = { ...s, status: e?.status ?? "not_started", note: e?.note ?? "", at: e?.recorded_at ?? null };
    let c = byCat.get(s.category);
    if (!c) {
      c = { category: s.category, total: 0, achieved: 0, practicing: 0, skills: [] };
      byCat.set(s.category, c);
    }
    c.total++;
    if (state.status === "achieved") c.achieved++;
    if (state.status === "practicing") c.practicing++;
    c.skills.push(state);
  }
  return [...byCat.values()];
}

/** Water level 0..100: achieved counts fully, practicing counts half. */
export function categoryLevel(c: Pick<CategorySummary, "total" | "achieved" | "practicing">) {
  if (!c.total) return 0;
  return Math.round(((c.achieved + c.practicing / 2) / c.total) * 100);
}
