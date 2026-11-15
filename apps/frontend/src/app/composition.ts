import type { Services } from "../services/contracts";
import {
  browserMockSessionStorage,
  createMockAuth,
  DEMO_PASSWORD,
  MOCK_ACCOUNTS,
} from "../services/mock/auth";
import { protectMockData } from "../services/mock/protected-data";
import {
  createDiscoveryCatalog,
  createMockDiscovery,
} from "../services/mock/discovery";
import { createMockComparison } from "../services/mock/comparison";
import { createComparisonCatalog } from "../services/mock/comparison-fixtures";
import type { ApplicationRuntime, MockScenarioName } from "./service-context";

export const CONFIGURATION_ERROR =
  "Service configuration is unavailable. Choose an explicitly supported service mode.";

/** Large synthetic workload (#23): at least 200 columns by 2,000 generated rows. */
export const LARGE_SCENARIO = { processes: 220, generated_rows: 2000 } as const;

/**
 * The only application module that chooses concrete adapters. Never falls
 * back. `scenario` (the `mock-scenario` URL parameter, absent = null) only
 * selects synthetic fixtures inside the explicit mock adapter; any unknown
 * value, or any scenario outside mock mode, is a configuration error.
 */
export function createApplication(
  mode: unknown,
  scenario: unknown = null,
): ApplicationRuntime {
  if (mode !== "mock") throw new Error(CONFIGURATION_ERROR);
  if (scenario !== null && scenario !== "large")
    throw new Error(CONFIGURATION_ERROR);
  const name: MockScenarioName = scenario === "large" ? "large" : "default";
  const large = name === "large";
  const session = createMockAuth({ storage: browserMockSessionStorage() });
  const services: Services = {
    auth: session.auth,
    data: protectMockData(
      {
        ...createMockDiscovery(
          large
            ? { catalog: createDiscoveryCatalog(LARGE_SCENARIO.processes) }
            : {},
        ),
        ...createMockComparison(
          large
            ? {
                catalog: createComparisonCatalog(
                  LARGE_SCENARIO.processes,
                  LARGE_SCENARIO.generated_rows,
                  true,
                ),
              }
            : {},
        ),
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
      scenario: name,
    },
  };
}
