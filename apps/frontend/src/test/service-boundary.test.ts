import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

describe("service import/transport boundary", () => {
  const lint = new ESLint();
  it.each([
    'import { createSyntheticFixtures } from "../services/mock/fixtures"; void createSyntheticFixtures;',
    'import { createMockDiscovery } from "../services/mock/discovery"; void createMockDiscovery;',
    'import { getAuth } from "firebase/auth"; void getAuth;',
    'import axios from "axios"; void axios;',
    'void fetch("/protected");',
    'void globalThis.fetch("/protected");',
    'void window["fetch"]("/protected");',
    "void new XMLHttpRequest();",
    'void import("../services/mock/fixtures");',
  ])("rejects direct UI access: %s", async (source) => {
    const [result] = await lint.lintText(source, {
      filePath: "src/components/BoundaryProbe.ts",
    });
    expect(
      result.messages.some((message) =>
        [
          "no-restricted-imports",
          "no-restricted-globals",
          "no-restricted-syntax",
        ].includes(message.ruleId ?? ""),
      ),
    ).toBe(true);
  });
  it("allows transport-independent DTO imports and exact composition-root adapter imports", async () => {
    const [dto] = await lint.lintText(
      'import type { Services } from "../services/contracts"; export type BoundaryProbe = Services;',
      { filePath: "src/components/BoundaryProbe.ts" },
    );
    expect(dto.errorCount).toBe(0);
    const [composition] = await lint.lintText(
      'import {createMockDiscovery} from "../services/mock/discovery"; void createMockDiscovery;',
      { filePath: "src/app/composition.ts" },
    );
    expect(composition.errorCount).toBe(0);
  });
});
