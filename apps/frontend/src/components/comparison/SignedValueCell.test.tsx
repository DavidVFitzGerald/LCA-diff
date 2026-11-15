import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { decimalString } from "../../services/contracts";
import { CHART_PADDING, rowGeometry } from "./geometry";
import { SignedValueCell } from "./SignedValueCell";
import type { CellState } from "./SignedValueCell";

const d = decimalString;
const H = 40;
const geometry = (P: string, N: string) =>
  rowGeometry({ max_positive: d(P), max_negative_magnitude: d(N) }, H);
const present = (amount: string): CellState => ({
  kind: "present",
  amount: d(amount),
});
function cell(value: CellState, row = geometry("20", "80")) {
  const { container } = render(<SignedValueCell value={value} row={row} />);
  return container.firstElementChild as HTMLElement;
}
const px = (element: Element | null, property: "top" | "height") =>
  parseFloat((element as HTMLElement).style[property]);

describe("signed value cells (#22)", () => {
  it("draws the golden mixed row from whole-row geometry with value-only labels", () => {
    const row = geometry("20", "80");
    const negative = cell(present("-80"), row);
    expect(negative).toHaveStyle({
      height: `${1.25 * H + 2 * CHART_PADDING}px`,
    });
    const bar = negative.querySelector(".signed-bar")!;
    expect(bar).toHaveClass("negative");
    expect(px(bar, "top")).toBeCloseTo(0.25 * H);
    expect(px(bar, "height")).toBeCloseTo(H);
    expect(px(negative.querySelector(".zero-axis"), "top")).toBeCloseTo(
      0.25 * H,
    );
    expect(negative.querySelector(".signed-label")).toHaveTextContent(/^-80$/);
    const positive = cell(present("20"), row);
    expect(positive.querySelector(".signed-bar")).toHaveClass("positive");
    expect(px(positive.querySelector(".signed-bar"), "height")).toBeCloseTo(
      0.25 * H,
    );
    // Labels sit just above zero in rows with positive values.
    expect(positive.querySelector(".signed-label")).toHaveClass("above");
  });

  it("communicates sign without colour and keeps full precision on hover/focus", () => {
    const value = "-80.000000000000000000000001";
    const element = cell(present(value));
    expect(element).toHaveAccessibleName(`${value}, negative`);
    expect(element).toHaveAttribute("tabindex", "0");
    expect(element.querySelector(".signed-label")).toHaveTextContent("-80");
    const tooltip = screen.getByRole("tooltip", { hidden: true });
    expect(tooltip).toHaveTextContent(value);
    fireEvent.focus(element);
    expect(tooltip).toHaveTextContent(value);
    expect(
      cell(present("1e-300"), geometry("1e-300", "0")),
    ).toHaveAccessibleName("1e-300, positive");
  });

  it("labels tiny and huge exact values adaptively while the tooltip keeps every digit", () => {
    const tiny = "0.000000000000000000000123456789";
    const element = cell(present(tiny), geometry(tiny, "0"));
    expect(element.querySelector(".signed-label")).toHaveTextContent(
      "1.235e-22",
    );
    expect(element.querySelector(".signed-tooltip")).toHaveTextContent(tiny);
  });

  it("shows present zero as 0 with no bar, and -0 the same way", () => {
    for (const zero of ["0", "-0"]) {
      const element = cell(present(zero), geometry("0", "0"));
      expect(element.querySelector(".signed-bar")).toBeNull();
      expect(element.querySelector(".signed-label")).toHaveTextContent(/^0$/);
      expect(element.querySelector(".signed-tooltip")).toHaveTextContent(/^0$/);
      expect(element).toHaveAccessibleName("0, zero");
      // All-zero rows: standard height, thin near-top baseline, labels below.
      expect(element).toHaveStyle({ height: `${H + 2 * CHART_PADDING}px` });
      expect(element.querySelector(".signed-label")).toHaveClass("below");
    }
  });

  it("leaves absent flows completely blank", () => {
    const element = cell({ kind: "absent" });
    // Nothing visible: no chart, bar, axis or label; only screen-reader text.
    expect(element.querySelector(".signed-chart")).toBeNull();
    expect(element.children).toHaveLength(1);
    expect(element.firstElementChild).toHaveClass("signed-sr-only");
    expect(element).toHaveTextContent(/^No flow$/);
    expect(element).not.toHaveAttribute("tabindex");
    expect(element).not.toHaveAttribute("aria-label");
  });

  it("shows N/A for unavailable scores, never a bar or zero", () => {
    const element = cell(
      { kind: "unavailable", reason: "unresolved reference basis" },
      geometry("5", "0"),
    );
    expect(element.querySelector(".signed-bar")).toBeNull();
    expect(element.querySelector(".signed-label")).toHaveTextContent(/^N\/A$/);
    expect(element).toHaveAccessibleName("N/A, not available");
    expect(element).toHaveAccessibleDescription(
      "N/A: unresolved reference basis",
    );
  });

  it("raises colour intensity with magnitude", () => {
    const row = geometry("100", "0");
    const opacity = (value: string) =>
      Number(
        (cell(present(value), row).querySelector(".signed-bar") as HTMLElement)
          .style.opacity,
      );
    expect(opacity("10")).toBeLessThan(opacity("50"));
    expect(opacity("50")).toBeLessThan(opacity("100"));
  });

  it("can leave focus to a grid's roving tab stop", () => {
    const { container } = render(
      <SignedValueCell
        value={present("1")}
        row={geometry("1", "0")}
        focusable={false}
      />,
    );
    expect(container.firstElementChild).toHaveAttribute("tabindex", "-1");
  });
});

describe("cell warnings (#24)", () => {
  const warning = (code: string, message: string) => ({ code, message });
  function warned(value: CellState, warnings = [warning("ANY", "Check me")]) {
    const { container } = render(
      <SignedValueCell
        value={value}
        row={geometry("20", "80")}
        warnings={warnings}
      />,
    );
    return container.firstElementChild as HTMLElement;
  }

  it("marks the cell without colour alone and names every warning", () => {
    const element = warned(present("20"), [
      warning("FIRST_CODE", "First synthetic warning"),
      warning("OTHER_CODE", "Second synthetic warning"),
    ]);
    const icon = element.querySelector('[data-testid="cell-warning"]');
    expect(icon).toHaveTextContent("!");
    expect(icon).toHaveAttribute("aria-hidden");
    expect(element).toHaveAccessibleName(
      "20, positive. Warning: First synthetic warning; Second synthetic warning.",
    );
    const tooltip = element.querySelector(".signed-tooltip")!;
    expect(tooltip).toHaveTextContent(
      "20 Warning: First synthetic warning Warning: Second synthetic warning",
    );
    expect(
      [...tooltip.querySelectorAll("[data-code]")].map((e) => e.textContent),
    ).toEqual([
      "Warning: First synthetic warning",
      "Warning: Second synthetic warning",
    ]);
  });

  it("changes neither bar geometry, row height nor the value label", () => {
    const plain = cell(present("20"));
    const element = warned(present("20"));
    for (const selector of [".signed-bar", ".zero-axis", ".signed-label"])
      expect(element.querySelector<HTMLElement>(selector)!.style.cssText).toBe(
        plain.querySelector<HTMLElement>(selector)!.style.cssText,
      );
    expect(element.style.height).toBe(plain.style.height);
    expect(element.querySelector(".signed-label")).toHaveTextContent(/^20$/);
    expect(plain.querySelector('[data-testid="cell-warning"]')).toBeNull();
    expect(plain).not.toHaveAttribute("data-warning");
  });

  it("keeps a warned absent cell blank, with the warning announced", () => {
    const element = warned({ kind: "absent" });
    expect(element.querySelector(".signed-bar")).toBeNull();
    expect(element.querySelector(".signed-label")).toBeNull();
    expect(element.querySelector(".signed-sr-only")).toHaveTextContent(
      /^No flow\. Warning: Check me\.$/,
    );
    expect(element.textContent).not.toMatch(/\b0\b/);
    expect(
      element.querySelector('[data-testid="cell-warning"]'),
    ).not.toBeNull();
  });

  it("describes a warned N/A cell through its tooltip", () => {
    const element = warned({ kind: "unavailable", reason: "missing" });
    expect(element).toHaveAccessibleName(
      "N/A, not available. Warning: Check me.",
    );
    expect(element).toHaveAccessibleDescription(
      /^N\/A: missing.*Warning: Check me$/,
    );
  });
});
