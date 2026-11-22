import { describe, expect, it } from "vitest";
import {
  addDays,
  businessDay,
  canParentCancel,
  fmtDate,
  fmtMoney,
  fmtTime,
  healthValid,
  localToUtc,
  parseShekel,
  weekdayOf,
  weekStart,
} from "@/domain/format";

describe("money (integer agorot)", () => {
  it("parses whole and decimal shekels without float drift", () => {
    expect(parseShekel("200")).toBe(20000);
    expect(parseShekel("0.1")).toBe(10);
    expect(parseShekel("12.5")).toBe(1250);
    expect(parseShekel("19.99")).toBe(1999);
    expect(parseShekel(" 7 ")).toBe(700);
  });
  it("rejects negatives, >2 decimals and junk", () => {
    expect(parseShekel("-5")).toBeNull();
    expect(parseShekel("1.234")).toBeNull();
    expect(parseShekel("abc")).toBeNull();
    expect(parseShekel("")).toBeNull();
  });
  it("formats with grouping and only needed decimals", () => {
    expect(fmtMoney(20000)).toBe("200 ₪");
    expect(fmtMoney(124050)).toBe("1,240.50 ₪");
  });
});

describe("business time (Asia/Jerusalem)", () => {
  it("formats time and date in business tz", () => {
    expect(fmtTime(new Date("2026-11-12T14:30:00Z"))).toBe("16:30"); // winter +2
    expect(fmtTime(new Date("2026-07-01T13:30:00Z"))).toBe("16:30"); // summer +3
    expect(fmtDate(new Date("2026-11-22T10:00:00Z"))).toBe("22.11.2026");
    expect(businessDay(new Date("2026-11-22T22:30:00Z"))).toBe("2026-11-23"); // after local midnight
  });

  it("localToUtc is DST-correct around 2026-03-27 (DST starts)", () => {
    expect(localToUtc("2026-03-26", "12:00").toISOString()).toBe("2026-03-26T10:00:00.000Z");
    expect(localToUtc("2026-03-27", "12:00").toISOString()).toBe("2026-03-27T09:00:00.000Z");
  });

  it("localToUtc is DST-correct around 2026-10-25 (DST ends)", () => {
    expect(localToUtc("2026-10-24", "10:00").toISOString()).toBe("2026-10-24T07:00:00.000Z");
    expect(localToUtc("2026-10-25", "10:00").toISOString()).toBe("2026-10-25T08:00:00.000Z");
  });

  it("calendar day math", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(weekdayOf("2026-11-22")).toBe(0); // Sunday
    expect(weekStart("2026-11-25")).toBe("2026-11-22");
    expect(weekStart("2026-11-22")).toBe("2026-11-22");
  });
});

describe("cancellation policy", () => {
  const start = new Date("2026-11-30T08:00:00Z");
  it("allows exactly 24h before", () => {
    expect(canParentCancel(start, new Date(start.getTime() - 24 * 3600_000), 24)).toBe(true);
  });
  it("blocks 1ms inside the window", () => {
    expect(canParentCancel(start, new Date(start.getTime() - 24 * 3600_000 + 1), 24)).toBe(false);
  });
  it("uses real elapsed hours across the DST change", () => {
    // 2026-10-25 10:00 local (after fallback) checked at 2026-10-24 10:00 local = 25 real hours
    const lesson = localToUtc("2026-10-25", "10:00");
    const now = localToUtc("2026-10-24", "10:00");
    expect(canParentCancel(lesson, now, 25)).toBe(true);
    expect(canParentCancel(lesson, now, 26)).toBe(false);
  });
});

describe("health declaration validity", () => {
  const at = new Date("2026-11-22T12:00:00Z");
  it("not required → always valid", () => expect(healthValid(null, 12, false, at)).toBe(true));
  it("missing signature → invalid", () => expect(healthValid(null, 12, true, at)).toBe(false));
  it("within validity → valid", () => expect(healthValid("2026-01-01T00:00:00Z", 12, true, at)).toBe(true));
  it("expired → invalid", () => expect(healthValid("2025-10-01T00:00:00Z", 12, true, at)).toBe(false));
});
