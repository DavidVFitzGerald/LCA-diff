import type { Services } from "../services/contracts";
import {
  browserMockSessionStorage,
  createMockAuth,
  DEMO_PASSWORD,
  MOCK_ACCOUNTS,
} from "../services/mock/auth";
import { protectMockData } from "../services/mock/protected-data";
import { createMockDiscovery } from "../services/mock/discovery";
import { createMockComparison } from "../services/mock/comparison";
import type { ApplicationRuntime } from "./service-context";

export const CONFIGURATION_ERROR =
  "Service configuration is unavailable. Choose an explicitly supported service mode.";

/** The only application module that chooses concrete adapters. Never falls back. */
export function createApplication(mode: unknown): ApplicationRuntime {
  if (mode !== "mock") throw new Error(CONFIGURATION_ERROR);
  const session = createMockAuth({ storage: browserMockSessionStorage() });
  const services: Services = {
    auth: session.auth,
    data: protectMockData(
      {
        ...createMockDiscovery(),
        ...createMockComparison(),
        async identity() {
          const state = session.getSnapshot();
          if (state.status === "authenticated" && state.user.email_verified)
            return {
              ok: true,
              data: {
                ...state.user,
                email_verified: true,
                access: { published_catalog: true },
              },
            };
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
      session,
    ),
  };
  return {
    mode: "mock",
    services,
    demo: {
      password: DEMO_PASSWORD,
      verified_email: MOCK_ACCOUNTS.find((user) => user.email_verified)!.email,
      unverified_email: MOCK_ACCOUNTS.find((user) => !user.email_verified)!
        .email,
      registration_example: "new@example.invalid",
    },
  };
}
