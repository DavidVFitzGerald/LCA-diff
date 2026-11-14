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
    expect(element).toHaveTextContent("");
    expect(element.childElementCount).toBe(0);
    expect(element).not.toHaveAttribute("tabindex");
    expect(element).toHaveAccessibleName("No flow");
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
