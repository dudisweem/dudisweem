import "server-only";
import { createClient } from "@/lib/supabase/server";
import { summarize, type CategorySummary, type ProgressEntry, type Skill } from "@/domain/progress";

/** Progress for one student, through RLS (parent/guardian/instructor-who-taught/admin). */
export async function loadProgress(studentId: string): Promise<CategorySummary[]> {
  const supabase = await createClient();
  const [skillsRes, entriesRes] = await Promise.all([
    supabase.from("skills").select("id, name, category, sort").eq("active", true).order("sort"),
    supabase.from("student_progress").select("skill_id, status, note, recorded_at").eq("student_id", studentId).order("recorded_at", { ascending: false }).limit(500),
  ]);
  return summarize((skillsRes.data ?? []) as Skill[], (entriesRes.data ?? []) as ProgressEntry[]);
}

/** Skills + latest entries for several students at once (instructor workday). */
export async function loadProgressMany(studentIds: string[]): Promise<{ skills: Skill[]; byStudent: Map<string, CategorySummary[]> }> {
  const supabase = await createClient();
  const { data: skills } = await supabase.from("skills").select("id, name, category, sort").eq("active", true).order("sort");
  const byStudent = new Map<string, CategorySummary[]>();
  if (studentIds.length === 0) return { skills: (skills ?? []) as Skill[], byStudent };
  const { data: entries } = await supabase
    .from("student_progress")
    .select("student_id, skill_id, status, note, recorded_at")
    .in("student_id", studentIds)
    .order("recorded_at", { ascending: false })
    .limit(2000);
  for (const id of studentIds) {
    const mine = (entries ?? []).filter((e) => e.student_id === id) as (ProgressEntry & { student_id: string })[];
    byStudent.set(id, summarize((skills ?? []) as Skill[], mine));
  }
  return { skills: (skills ?? []) as Skill[], byStudent };
}
