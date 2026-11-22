// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { FormGuard } from "@/ui/FormGuard";

afterEach(cleanup);

// jsdom has no layout APIs
Element.prototype.scrollIntoView = vi.fn();
window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;

function Form({ onSubmit }: { onSubmit: () => void }) {
  return (
    <>
      <FormGuard />
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <div className="field">
          <label htmlFor="name">שם</label>
          <input id="name" name="name" defaultValue="דנה" required />
        </div>
        <div className="field">
          <label htmlFor="phone">טלפון</label>
          <input id="phone" name="phone" required />
        </div>
        <button type="submit">שליחה</button>
      </form>
    </>
  );
}

describe("FormGuard", () => {
  it("blocks submit, marks the missing field red and focuses it", () => {
    const onSubmit = vi.fn();
    const { container } = render(<Form onSubmit={onSubmit} />);
    const form = container.querySelector("form")!;
    fireEvent.submit(form);
    expect(onSubmit).not.toHaveBeenCalled();
    const phoneField = container.querySelector("#phone")!.closest(".field")!;
    expect(phoneField.classList.contains("invalid")).toBe(true);
    expect(phoneField.textContent).toContain("שדה חובה");
    expect(document.activeElement?.id).toBe("phone");
    // the filled field is untouched
    expect(container.querySelector("#name")!.closest(".field")!.classList.contains("invalid")).toBe(false);
  });

  it("clears the mark once fixed and lets the submit through", () => {
    const onSubmit = vi.fn();
    const { container } = render(<Form onSubmit={onSubmit} />);
    const form = container.querySelector("form")!;
    fireEvent.submit(form);
    const phone = container.querySelector<HTMLInputElement>("#phone")!;
    fireEvent.input(phone, { target: { value: "0501234567" } });
    expect(phone.closest(".field")!.classList.contains("invalid")).toBe(false);
    fireEvent.submit(form);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("keeps typed values when something resets the form (React 19 post-action reset)", () => {
    const { container } = render(<Form onSubmit={() => {}} />);
    const form = container.querySelector("form")!;
    const phone = container.querySelector<HTMLInputElement>("#phone")!;
    fireEvent.input(phone, { target: { value: "0501234567" } });
    form.reset();
    expect(phone.value).toBe("0501234567");
  });
});
