import { describe, expect, it } from "vitest";
import { categoryLevel, currentStatus, summarize, type ProgressEntry, type Skill } from "@/domain/progress";
import { describeRequest } from "@/domain/availability";

const skills: Skill[] = [
  { id: "a", name: "ציפה על הגב", category: "ציפה", sort: 20 },
  { id: "b", name: "ציפה על הבטן", category: "ציפה", sort: 10 },
  { id: "c", name: "חתירה", category: "סגנונות", sort: 30 },
];

describe("progress", () => {
  it("latest entry wins regardless of order", () => {
    const entries: ProgressEntry[] = [
      { skill_id: "a", status: "achieved", note: "", recorded_at: "2026-11-20T10:00:00Z" },
      { skill_id: "a", status: "practicing", note: "", recorded_at: "2026-11-01T10:00:00Z" },
    ];
    expect(currentStatus(entries).get("a")?.status).toBe("achieved");
  });

  it("groups by category, sorted, defaulting to not_started", () => {
    const s = summarize(skills, [{ skill_id: "a", status: "achieved", note: "יפה", recorded_at: "2026-11-20T10:00:00Z" }]);
    expect(s.map((c) => c.category)).toEqual(["ציפה", "סגנונות"]);
    expect(s[0]!.skills.map((k) => k.id)).toEqual(["b", "a"]);
    expect(s[0]!.achieved).toBe(1);
    expect(s[1]!.skills[0]!.status).toBe("not_started");
  });

  it("water level counts practicing as half", () => {
    expect(categoryLevel({ total: 4, achieved: 1, practicing: 2 })).toBe(50);
    expect(categoryLevel({ total: 0, achieved: 0, practicing: 0 })).toBe(0);
  });
});

describe("availability request text", () => {
  it("describes added weekly hours", () => {
    expect(describeRequest("add_hours", { weekdays: [1, 3], start: "16:00:00", end: "19:00" })).toBe("הוספת שעות: שני, רביעי 16:00–19:00");
  });
  it("falls back when a referenced row is gone", () => {
    expect(describeRequest("remove_hours", { id: "x" })).toContain("טווח שעות קבוע");
  });
});
