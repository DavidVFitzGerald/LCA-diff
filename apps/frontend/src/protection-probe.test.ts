import { expect, it } from "vitest";

it("intentionally fails to verify the required quality gate", () => {
  expect(true).toBe(false);
});
