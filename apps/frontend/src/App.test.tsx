import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("development mount", () => {
  it("renders an accessible main region identifying the unfinished scaffold", () => {
    render(<App />);
    const main = screen.getByRole("main");
    expect(
      within(main).getByRole("heading", { name: "LCA diff", level: 1 }),
    ).toBeVisible();
    expect(
      within(main).getByText(/product journeys are not available yet/),
    ).toBeVisible();
  });
});
