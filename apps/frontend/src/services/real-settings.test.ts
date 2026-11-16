import { describe, it, expect } from "vitest";
import { realSettings } from "./firebase-adapter";
const settings = {
  VITE_API_BASE: "/api/v1",
  VITE_FIREBASE_PROJECT_ID: "demo-lca",
  VITE_FIREBASE_API_KEY: "local-emulator-only",
  VITE_AUTH_EMULATOR: "same-origin",
};
describe("local real settings", () => {
  it("requires every setting and rejects a production project or arbitrary transport", () => {
    expect(realSettings(settings)).toEqual({
      apiBase: "/api/v1",
      projectId: "demo-lca",
      apiKey: "local-emulator-only",
      emulator: "same-origin",
    });
    for (const key of Object.keys(settings))
      expect(() => realSettings({ ...settings, [key]: undefined })).toThrow();
    for (const value of ["production-project", "demo-", "demo-A", ""])
      expect(() =>
        realSettings({ ...settings, VITE_FIREBASE_PROJECT_ID: value }),
      ).toThrow();
    expect(() =>
      realSettings({ ...settings, VITE_API_BASE: "https://untrusted.invalid" }),
    ).toThrow();
    expect(() =>
      realSettings({ ...settings, VITE_AUTH_EMULATOR: "off" }),
    ).toThrow();
  });
});
