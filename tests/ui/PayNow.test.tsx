// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PayNow } from "@/ui/parent/PayNow";

afterEach(cleanup);

describe("PayNow", () => {
  it("a configured payment link wins and opens directly", () => {
    render(<PayNow method="paybox" amount={20000} bitPhone="" bitLink="" payboxLink="https://payboxapp.page.link/abc" />);
    const a = screen.getByRole("link");
    expect(a.getAttribute("href")).toBe("https://payboxapp.page.link/abc");
    expect(a.textContent).toContain("PayBox");
  });

  it("PayBox without a link opens the verified app-link domain", () => {
    render(<PayNow method="paybox" amount={15000} bitPhone="0501234567" bitLink="" payboxLink="" />);
    expect(screen.getByRole("link").getAttribute("href")).toBe("https://links.payboxapp.com/");
    expect(screen.getByText("0501234567")).toBeTruthy();
  });

  it("Bit on desktop never shows a dead 'open' button — it copies the number", () => {
    render(<PayNow method="bit" amount={20000} bitPhone="0501234567" bitLink="" payboxLink="" />);
    expect(screen.getByRole("button").textContent).toContain("העתקת מספר ה־Bit");
    expect(screen.getByText("200 ₪", { exact: false })).toBeTruthy();
  });

  it("Bit without phone or link on desktop shows instructions only", () => {
    render(<PayNow method="bit" amount={20000} bitPhone="" bitLink="" payboxLink="" />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
