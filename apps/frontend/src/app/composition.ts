import type { Services } from "../services/contracts";
import { createPlaceholderAuth } from "../services/auth-placeholder";
import { createMockDiscovery } from "../services/mock/discovery";
import { createMockComparison } from "../services/mock/comparison";
import type { ApplicationRuntime } from "./service-context";

export const CONFIGURATION_ERROR =
  "Service configuration is unavailable. Choose an explicitly supported service mode.";

/** The only application module that chooses concrete adapters. Never falls back. */
export function createApplication(mode: unknown): ApplicationRuntime {
  if (mode !== "mock") throw new Error(CONFIGURATION_ERROR);
  const services: Services = {
    auth: createPlaceholderAuth(),
    data: {
      ...createMockDiscovery(),
      ...createMockComparison(),
      async identity() {
        return {
          ok: false,
          error: {
            code: "AUTH_REQUIRED",
            message: "Authentication required",
            request_id: "synthetic-identity",
            retryable: false,
          },
        };
      },
      async health() {
        return { ok: true, data: { status: "ok" } };
      },
    },
  };
  return { mode: "mock", services };
}
