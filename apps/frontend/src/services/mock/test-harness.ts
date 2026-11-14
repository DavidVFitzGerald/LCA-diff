/**
 * Shared component-test harness for mock-injected workspace journeys
 * (#16 tree, #18 selection). Test-only: imported by *.test.tsx files under
 * services/mock, which the ESLint boundary allows to use mock adapters.
 * No production module imports it.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, useQueryClient } from "@tanstack/react-query";
import { createElement, Fragment, useEffect } from "react";
import { afterAll, beforeAll, beforeEach, vi } from "vitest";
import { App } from "../../App";
import { ApplicationProviders } from "../../app/ApplicationProviders";
import { createApplication } from "../../app/composition";
import { decimalString } from "../contracts";
import type {
  AuthService,
  AuthState,
  DataService,
  ProcessHeader,
  Release,
  ServiceErrorCode,
  ServiceResult,
} from "../contracts";
import { createMockDiscovery } from "./discovery";
import type { DiscoveryCatalog, DiscoveryScenario } from "./discovery";

/** Viewport heights (px) of the virtualized scrollers; reset before each test. */
export const geometry = { tree: 320, list: 240 };
const scrollers: Record<string, keyof typeof geometry> = {
  "process-tree": "tree",
  "selected-list": "list",
};
const viewportOf = (element: HTMLElement) => {
  for (const [name, key] of Object.entries(scrollers))
    if (element.classList.contains(name)) return geometry[key];
  return null;
};

/** jsdom has no layout: give the scrollers a viewport and a scroll API. */
export function installScrollGeometry() {
  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      get(this: HTMLElement) {
        return viewportOf(this) ?? 0;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get(this: HTMLElement) {
        const sizer = this.firstElementChild as HTMLElement | null;
        return viewportOf(this) !== null && sizer
          ? parseFloat(sizer.style.height) || 0
          : 0;
      },
    });
    const offsets = new WeakMap<Element, number>();
    Object.defineProperty(HTMLElement.prototype, "scrollTop", {
      configurable: true,
      get(this: HTMLElement) {
        return offsets.get(this) ?? 0;
      },
      set(this: HTMLElement, value: number) {
        // Browsers clamp scroll offsets to the scrollable range.
        const max = Math.max(0, this.scrollHeight - this.clientHeight);
        offsets.set(this, Math.min(Math.max(0, value), max));
      },
    });
    Element.prototype.scrollTo = function (
      this: Element,
      options?: ScrollToOptions | number,
    ) {
      if (typeof options === "object" && options.top !== undefined) {
        this.scrollTop = options.top;
        this.dispatchEvent(new Event("scroll"));
      }
    };
  });
  afterAll(() => {
    // Restore the inherited jsdom Element.prototype getters.
    Reflect.deleteProperty(HTMLElement.prototype, "clientHeight");
    Reflect.deleteProperty(HTMLElement.prototype, "scrollTop");
    Reflect.deleteProperty(HTMLElement.prototype, "scrollHeight");
  });
  beforeEach(() => {
    geometry.tree = 320;
    geometry.list = 240;
    localStorage.clear();
    sessionStorage.clear();
  });
}

export interface LeafSpec {
  name: string;
  geography?: string;
  path: string[];
}
export function catalog(
  releases: { id: string; name: string; version: string; leaves: LeafSpec[] }[],
): DiscoveryCatalog {
  return {
    releases: releases.map((release): Release => ({
      release_id: release.id,
      revision_id: `${release.id}-rev`,
      database_code: "TEST",
      version: release.version,
      display_name: release.name,
      published_at: null,
    })),
    revisions: releases.map((release) => ({
      revision: { release_id: release.id, revision_id: `${release.id}-rev` },
      headers: release.leaves.map((leaf, index): ProcessHeader => ({
        release_id: release.id,
        revision_id: `${release.id}-rev`,
        id: `${release.id}:p${index}`,
        name: leaf.name,
        geography: leaf.geography ?? "CH",
        category: leaf.path[0] ?? "",
        subcategory: leaf.path.slice(1).join("\\"),
        category_path: leaf.path,
        reference_flow_name: "Synthetic output",
        reference_amount: decimalString("1"),
        reference_unit: "kg",
        warnings: [],
      })),
    })),
  };
}
export const many = (count: number, path: string[], prefix = "Leaf") =>
  Array.from({ length: count }, (_, index) => ({
    name: `${prefix} ${String(index).padStart(4, "0")}`,
    path,
  }));
export const standard = () =>
  catalog([
    {
      id: "r1",
      name: "Alpha catalog",
      version: "2026 v1",
      leaves: [
        { name: "Road A", path: ["transport", "road"] },
        { name: "Road A", geography: "DE", path: ["transport", "road"] },
        { name: "Infra", path: ["transport", "road", "infra"] },
        { name: "Ship", path: ["transport", "water"] },
      ],
    },
    {
      id: "r2",
      name: "Alpha catalog",
      version: "2026 v2",
      leaves: [{ name: "Road A", path: ["transport", "road"] }],
    },
  ]);
export const verified = (uid: string): AuthState => ({
  status: "authenticated",
  user: { uid, email: `${uid}@example.invalid`, email_verified: true },
});
const ok: ServiceResult<void> = { ok: true, data: undefined };
export const failure = (code: ServiceErrorCode, retryable = false) =>
  ({
    ok: false,
    error: { code, message: `Synthetic ${code}`, request_id: "t", retryable },
  }) as const;

/** Renders the verified App with an injected discovery mock and controllable auth. */
export function mount(
  options: {
    catalog?: DiscoveryCatalog;
    scenario?: DiscoveryScenario;
    wrap?: (
      discovery: ReturnType<typeof createMockDiscovery>,
    ) => Partial<DataService>;
  } = {},
) {
  let state = verified("account-a");
  const observers = new Set<(next: AuthState) => void>();
  const emit = (next: AuthState) => {
    state = next;
    observers.forEach((observer) => observer(next));
  };
  const base = createApplication("mock").services;
  const auth: AuthService = {
    ...base.auth,
    observe(listener) {
      observers.add(listener);
      queueMicrotask(() => observers.has(listener) && listener(state));
      return () => void observers.delete(listener);
    },
    signOut: vi.fn(async () => {
      emit({ status: "unauthenticated" });
      return ok;
    }),
  };
  const discovery = createMockDiscovery({
    catalog: options.catalog ?? standard(),
    scenario: options.scenario,
  });
  const overrides = options.wrap?.(discovery) ?? {};
  const releases = vi.fn(overrides.releases ?? discovery.releases);
  const search = vi.fn(overrides.search ?? discovery.search);
  const data = { ...base.data, releases, search };
  let client!: QueryClient;
  function Capture() {
    const value = useQueryClient();
    useEffect(() => {
      client = value;
    }, [value]);
    return null;
  }
  render(
    createElement(ApplicationProviders, {
      runtime: { mode: "test", services: { auth, data } },
      children: createElement(
        Fragment,
        null,
        createElement(App),
        createElement(Capture),
      ),
    }),
  );
  return {
    search,
    releases,
    data,
    client: () => client,
    emit: (next: AuthState) => act(() => emit(next)),
  };
}
export const tree = () => screen.findByRole("tree", { name: "Processes" });
export const item = (name: string | RegExp) =>
  screen.getByRole("treeitem", { name });
export const items = () => screen.queryAllByRole("treeitem");
export const key = (k: string) => {
  const target = document.activeElement!;
  fireEvent.keyDown(target, { key: k });
};
export async function focusTree() {
  const root = (await tree()).querySelector<HTMLElement>('[tabindex="0"]')!;
  act(() => root.focus());
  return root;
}
export const settle = () => act(async () => {});
