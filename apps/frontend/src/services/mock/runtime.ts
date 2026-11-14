import type { ServiceErrorCode, ServiceResult } from "../contracts";

/** Copy the serializable DTO graph at request/response boundaries. */
export function copy<T>(value: T): T {
  if (Array.isArray(value)) return value.map(copy) as T;
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, copy(item)]),
    ) as T;
  return value;
}
const messages: Record<ServiceErrorCode, string> = {
  AUTH_REQUIRED: "Authentication required",
  EMAIL_NOT_VERIFIED: "Email verification required",
  RELEASE_UNAVAILABLE: "Release unavailable",
  UNKNOWN_PROCESS: "Process unavailable in requested snapshot",
  INVALID_FILTER: "Invalid search or cursor",
  STALE_SNAPSHOT: "Revision snapshot unavailable",
  REQUEST_WINDOW_TOO_LARGE:
    "Transport window exceeds the configured batch size",
  TEMPORARILY_UNAVAILABLE: "Synthetic temporary failure",
  UNSUPPORTED_OPERATION: "Operation unsupported",
  AUTH_FAILED: "Authentication failed",
};
export class MockFailure extends Error {
  constructor(readonly code: ServiceErrorCode) {
    super(messages[code]);
  }
}
export function invalid(): never {
  throw new MockFailure("INVALID_FILTER");
}
export function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
export interface MockScenario<Operation extends string> {
  readonly latency_ms?:
    number | ((operation: Operation, sequence: number) => number);
  readonly failures?: Partial<Record<Operation, ServiceErrorCode>>;
}
export function createMockRequest<Operation extends string>(
  scenario: MockScenario<Operation> = {},
) {
  const failures: Partial<Record<Operation, ServiceErrorCode>> = {
    ...scenario.failures,
  };
  const latency = scenario.latency_ms ?? 0;
  if (typeof latency === "number" && (!Number.isFinite(latency) || latency < 0))
    throw new TypeError("Invalid synthetic latency");
  let sequence = 0;

  function request<T>(
    operation: Operation,
    signal: AbortSignal | undefined,
    run: (requestId: string) => T,
  ): Promise<ServiceResult<T>> {
    const call = ++sequence;
    const requestId = `synthetic-${operation}-${call}`;
    const delay =
      typeof latency === "function" ? latency(operation, call) : latency;
    if (!Number.isFinite(delay) || delay < 0)
      return Promise.reject(new TypeError("Invalid synthetic latency"));
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException("Request aborted", "AbortError"));
        return;
      }
      const abort = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        reject(new DOMException("Request aborted", "AbortError"));
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", abort);
        if (signal?.aborted) {
          reject(new DOMException("Request aborted", "AbortError"));
          return;
        }
        try {
          const failure = failures[operation];
          if (failure) throw new MockFailure(failure);
          resolve({ ok: true, data: copy(run(requestId)) });
        } catch (error) {
          if (!(error instanceof MockFailure)) {
            reject(error);
            return;
          }
          resolve({
            ok: false,
            error: {
              code: error.code,
              message: messages[error.code],
              request_id: requestId,
              retryable: error.code === "TEMPORARILY_UNAVAILABLE",
            },
          });
        }
      }, delay);
      signal?.addEventListener("abort", abort, { once: true });
    });
  }

  return request;
}
