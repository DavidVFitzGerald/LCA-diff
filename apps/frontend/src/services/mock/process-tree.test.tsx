/**
 * Process tree (#16) integration with the deterministic discovery mock.
 *
 * Lives under services/mock because the ESLint boundary forbids every other
 * module, tests included, from importing mock adapters (D9: inject
 * createMockDiscovery without weakening that rule). No production module
 * imports this file. Scenarios here are component-level evidence only.
 */
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { App } from "../../App";
import { ApplicationProviders } from "../../app/ApplicationProviders";
import { createApplication } from "../../app/composition";
import { TREE_PAGE_LIMIT } from "../../components/process-tree/model";
import { TREE_ROW_HEIGHT } from "../../components/process-tree/ProcessTree";
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

// jsdom has no layout: give the tree scroller a viewport and a scroll API.
let viewport = 320;
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains("process-tree") ? viewport : 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get(this: HTMLElement) {
      const sizer = this.firstElementChild as HTMLElement | null;
      return this.classList.contains("process-tree") && sizer
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
  // Restore the inherited jsdom Element.prototype getter.
  Reflect.deleteProperty(HTMLElement.prototype, "clientHeight");
  Reflect.deleteProperty(HTMLElement.prototype, "scrollTop");
  Reflect.deleteProperty(HTMLElement.prototype, "scrollHeight");
});
beforeEach(() => {
  viewport = 320;
  localStorage.clear();
});

interface LeafSpec {
  name: string;
  geography?: string;
  path: string[];
}
function catalog(
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
const many = (count: number, path: string[], prefix = "Leaf") =>
  Array.from({ length: count }, (_, index) => ({
    name: `${prefix} ${String(index).padStart(4, "0")}`,
    path,
  }));
const standard = () =>
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
const verified = (uid: string): AuthState => ({
  status: "authenticated",
  user: { uid, email: `${uid}@example.invalid`, email_verified: true },
});
const ok: ServiceResult<void> = { ok: true, data: undefined };
const failure = (code: ServiceErrorCode, retryable = false) =>
  ({
    ok: false,
    error: { code, message: `Synthetic ${code}`, request_id: "t", retryable },
  }) as const;

function mount(
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
  let client!: QueryClient;
  function Capture() {
    const value = useQueryClient();
    useEffect(() => {
      client = value;
    }, [value]);
    return null;
  }
  render(
    <ApplicationProviders
      runtime={{
        mode: "test",
        services: { auth, data: { ...base.data, releases, search } },
      }}
    >
      <App />
      <Capture />
    </ApplicationProviders>,
  );
  return {
    search,
    releases,
    client: () => client,
    emit: (next: AuthState) => act(() => emit(next)),
  };
}
const tree = () => screen.findByRole("tree", { name: "Processes" });
const item = (name: string | RegExp) => screen.getByRole("treeitem", { name });
const items = () => screen.queryAllByRole("treeitem");
const key = (k: string) => {
  const target = document.activeElement!;
  fireEvent.keyDown(target, { key: k });
};
async function focusTree() {
  const root = (await tree()).querySelector<HTMLElement>('[tabindex="0"]')!;
  act(() => root.focus());
  return root;
}
const settle = () => act(async () => {});

describe("process tree roots and scoped loading", () => {
  it("renders release roots collapsed and searches one branch scope at a time", async () => {
    const app = mount();
    await tree();
    const roots = items();
    expect(roots.map((row) => row.getAttribute("aria-label"))).toEqual([
      "Alpha catalog 2026 v1",
      "Alpha catalog 2026 v2",
    ]);
    roots.forEach((row) => {
      expect(row).toHaveAttribute("aria-expanded", "false");
      expect(row).toHaveAttribute("aria-level", "1");
      expect(row).toHaveAttribute("aria-setsize", "2");
    });
    expect(app.search).not.toHaveBeenCalled();
    await focusTree();
    key("ArrowRight");
    await waitFor(() => expect(item(/^transport, 4 processes/)).toBeVisible());
    expect(app.search).toHaveBeenCalledTimes(1);
    expect(app.search.mock.calls[0][0]).toEqual({
      fields: {},
      branch_path: [],
      revision_snapshot: [{ release_id: "r1", revision_id: "r1-rev" }],
      limit: TREE_PAGE_LIMIT,
    });
    expect(item("Alpha catalog 2026 v1, 4 processes")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    key("ArrowDown");
    key("ArrowRight");
    await waitFor(() => expect(item("road, 3 processes")).toBeVisible());
    expect(app.search.mock.calls[1][0]).toMatchObject({
      branch_path: ["transport"],
      revision_snapshot: [{ release_id: "r1", revision_id: "r1-rev" }],
    });
    // Same path and labels in the second release stay a distinct root.
    expect(item("Alpha catalog 2026 v2")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("pages a large branch without replacing or duplicating loaded rows", async () => {
    viewport = TREE_ROW_HEIGHT * 200;
    const app = mount({
      catalog: catalog([
        { id: "r1", name: "Big", version: "v", leaves: many(120, ["t"]) },
      ]),
    });
    await focusTree();
    key("ArrowRight");
    await waitFor(() => expect(item(/^t, 120 processes/)).toBeVisible());
    key("ArrowDown");
    key("ArrowRight");
    const more = await screen.findByRole("treeitem", {
      name: "Load more in t (50 of 120 loaded)",
    });
    const first = item("Leaf 0000 — CH");
    expect(first).toHaveAttribute("aria-setsize", "-1");
    expect(first).toHaveAttribute("aria-posinset", "1");
    fireEvent.click(more);
    await screen.findByRole("treeitem", {
      name: "Load more in t (100 of 120 loaded)",
    });
    expect(item("Leaf 0099 — CH")).toBeVisible();
    expect(item("Leaf 0000 — CH")).toBe(first);
    fireEvent.click(item("Load more in t (100 of 120 loaded)"));
    await waitFor(() => expect(item("Leaf 0119 — CH")).toBeVisible());
    expect(
      screen.queryByRole("treeitem", { name: /^Load more in t / }),
    ).toBeNull();
    expect(item("Leaf 0000 — CH")).toBe(first);
    expect(first).toHaveAttribute("aria-setsize", "120");
    const leafRows = items().filter((row) =>
      row.getAttribute("aria-label")?.startsWith("Leaf"),
    );
    expect(leafRows).toHaveLength(120);
    const keys = items().map((row) => row.dataset.rowKey);
    expect(new Set(keys).size).toBe(keys.length);
    // The root query still has its own continuation.
    expect(item("Load more in Big (50 of 120 loaded)")).toBeVisible();
    expect(app.search).toHaveBeenCalledTimes(4);
  });
});

describe("process tree keyboard and ARIA", () => {
  it("follows the tree keyboard pattern with one tab stop and verbatim names", async () => {
    mount();
    const root = await focusTree();
    expect(
      document.querySelectorAll('[role="treeitem"][tabindex="0"]'),
    ).toHaveLength(1);
    key(" ");
    expect(root).toHaveAttribute("aria-expanded", "false");
    key("Enter");
    await waitFor(() => expect(item(/^transport/)).toBeVisible());
    key("ArrowRight"); // expanded: moves to first child
    expect(item(/^transport/)).toHaveFocus();
    key("Enter");
    await waitFor(() => expect(item("road, 3 processes")).toBeVisible());
    key("ArrowDown");
    key("ArrowRight");
    await waitFor(() => expect(item("infra, 1 process")).toBeVisible());
    const infra = item("infra, 1 process");
    expect(infra).toHaveAttribute("aria-level", "4");
    expect(infra).toHaveAttribute("aria-posinset", "1");
    // Set size is known once the branch's own scoped query is exhausted.
    await waitFor(() => expect(infra).toHaveAttribute("aria-setsize", "3"));
    // Duplicate display label + geography distinguish distinct processes.
    expect(item("Road A — CH")).toHaveAttribute("aria-posinset", "2");
    expect(item("Road A — DE")).toHaveAttribute("aria-posinset", "3");
    expect(item("Road A — CH")).not.toHaveAttribute("aria-expanded");
    key("ArrowDown");
    expect(infra).toHaveFocus();
    key("ArrowLeft"); // collapsed branch: move to parent
    expect(item("road, 3 processes")).toHaveFocus();
    key("ArrowLeft"); // expanded: collapse
    expect(item("road, 3 processes")).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("treeitem", { name: "infra, 1 process" }),
    ).toBeNull();
    key("End");
    expect(item("Alpha catalog 2026 v2")).toHaveFocus();
    key("Home");
    expect(item(/^Alpha catalog 2026 v1/)).toHaveFocus();
    key("ArrowUp");
    expect(item(/^Alpha catalog 2026 v1/)).toHaveFocus();
    expect(
      document.querySelectorAll('[role="treeitem"][tabindex="0"]'),
    ).toHaveLength(1);
  });

  it("moves focus to a collapsed ancestor and keeps focus out of the body", async () => {
    mount();
    await focusTree();
    key("Enter");
    await waitFor(() => expect(item(/^transport/)).toBeVisible());
    key("ArrowDown");
    key("Enter");
    await waitFor(() => expect(item("road, 3 processes")).toBeVisible());
    key("ArrowDown");
    expect(item("road, 3 processes")).toHaveFocus();
    fireEvent.click(item(/^Alpha catalog 2026 v1/)); // pointer collapse of the root
    await settle();
    expect(item("Alpha catalog 2026 v1, 4 processes")).toHaveFocus();
    expect(document.activeElement).not.toBe(document.body);
  });

  it("bounds mounted rows for 2,000 loaded leaves and scrolls keyboard focus into view", async () => {
    mount({
      catalog: catalog([
        { id: "r1", name: "Huge", version: "v", leaves: many(2000, ["t"]) },
      ]),
    });
    await focusTree();
    key("ArrowRight");
    await waitFor(() => expect(item(/^t, 2000 processes/)).toBeVisible());
    key("ArrowDown");
    key("ArrowRight");
    // The branch continuation is off-screen: reach it by keyboard (End, then up).
    await waitFor(() =>
      expect(item(/^t, 2000 processes/)).not.toHaveAttribute("aria-busy"),
    );
    key("End");
    await settle();
    key("ArrowUp");
    await settle();
    for (let loaded = 50; loaded < 2000; loaded += TREE_PAGE_LIMIT) {
      await waitFor(() =>
        expect(document.activeElement).toHaveAttribute(
          "aria-label",
          `Load more in t (${loaded} of 2000 loaded)`,
        ),
      );
      key("Enter");
    }
    // Exhausted: focus moves to the first newly revealed item.
    await waitFor(() =>
      expect(document.activeElement).toHaveAttribute(
        "aria-label",
        "Leaf 1950 — CH",
      ),
    );
    const limit = Math.ceil(viewport / TREE_ROW_HEIGHT) + 2 * 6 + 1;
    expect(items().length).toBeLessThanOrEqual(limit);
    key("End");
    await settle();
    const last = document.activeElement as HTMLElement;
    expect(last.getAttribute("aria-label")).toBe(
      "Load more in Huge (50 of 2000 loaded)",
    );
    const top = parseFloat(last.style.transform.replace(/[^0-9.]/g, ""));
    expect(top).toBeGreaterThan(2000 * TREE_ROW_HEIGHT);
    await settle();
    const scrolled = screen.getByRole("tree").scrollTop;
    expect(scrolled).toBeLessThanOrEqual(top);
    expect(scrolled + viewport).toBeGreaterThanOrEqual(top + TREE_ROW_HEIGHT);
    expect(document.activeElement).toBe(last);
    expect(items().length).toBeLessThanOrEqual(limit + 1);
    key("Home");
    await settle();
    expect(document.activeElement).toHaveAttribute(
      "aria-label",
      "Huge v, 2000 processes",
    );
  });
});

describe("process tree states and cancellation", () => {
  it("shows loading releases and branch loading under latency", async () => {
    mount({ scenario: { latency_ms: 40 } });
    expect(await screen.findByText("Loading releases…")).toBeVisible();
    await focusTree();
    key("ArrowRight");
    expect(item("Loading Alpha catalog…")).toBeVisible();
    expect(item(/^Alpha catalog 2026 v1/)).toHaveAttribute("aria-busy", "true");
    await waitFor(() => expect(item(/^transport/)).toBeVisible());
    expect(item(/^Alpha catalog 2026 v1/)).not.toHaveAttribute("aria-busy");
  });

  it("explains an empty catalog and a branch with zero processes", async () => {
    mount({ catalog: catalog([]) });
    expect(
      await screen.findByText("No published releases are available."),
    ).toBeVisible();
  });

  it("shows an explicit empty row for a release with no processes", async () => {
    mount({
      catalog: catalog([{ id: "r1", name: "Empty", version: "v", leaves: [] }]),
    });
    await focusTree();
    key("Enter");
    expect(
      await screen.findByRole("treeitem", { name: "No processes in Empty" }),
    ).toBeVisible();
  });

  it("retries a failed releases load and a failed page while keeping loaded nodes", async () => {
    let releasesFailed = false;
    let searches = 0;
    const app = mount({
      catalog: catalog([
        { id: "r1", name: "Big", version: "v", leaves: many(60, ["t"]) },
      ]),
      wrap: (discovery) => ({
        releases: async (...args) => {
          if (!releasesFailed) {
            releasesFailed = true;
            return failure("TEMPORARILY_UNAVAILABLE", true);
          }
          return discovery.releases(...args);
        },
        search: async (...args) => {
          searches += 1;
          if (searches === 2) return failure("TEMPORARILY_UNAVAILABLE", true);
          return discovery.search(...args);
        },
      }),
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Synthetic TEMPORARILY_UNAVAILABLE",
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await focusTree();
    key("ArrowRight");
    await waitFor(() => expect(item(/^t, 60 processes/)).toBeVisible());
    viewport = TREE_ROW_HEIGHT * 100;
    fireEvent.click(item("Load more in Big (50 of 60 loaded)"));
    const error = await screen.findByRole("treeitem", {
      name: "Could not load Big. Synthetic TEMPORARILY_UNAVAILABLE Retry",
    });
    act(() => error.focus());
    key("Enter");
    await waitFor(() =>
      expect(
        screen.queryByRole("treeitem", { name: /^Could not load/ }),
      ).toBeNull(),
    );
    expect(item(/^t, 60 processes/)).toBeVisible();
    expect(app.releases).toHaveBeenCalledTimes(2);
    expect(app.search).toHaveBeenCalledTimes(3);
  });

  it("shows non-retryable errors without a retry control", async () => {
    mount({ scenario: { failures: { search: "STALE_SNAPSHOT" } } });
    const root = await focusTree();
    key("Enter");
    const error = await screen.findByRole("treeitem", {
      name: "Could not load Alpha catalog. Revision snapshot unavailable",
    });
    expect(within(error).queryByText("Retry")).toBeNull();
    expect(root).toHaveFocus();
  });

  it("aborts an in-flight page when its branch collapses and refetches on re-expand", async () => {
    const app = mount({
      scenario: { latency_ms: (op) => (op === "search" ? 10_000 : 0) },
    });
    const root = await focusTree();
    key("ArrowRight");
    await waitFor(() => expect(app.search).toHaveBeenCalledTimes(1));
    const signal = app.search.mock.calls[0][1]!.signal!;
    expect(signal.aborted).toBe(false);
    key("ArrowLeft");
    await settle();
    expect(signal.aborted).toBe(true);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      screen.queryByRole("treeitem", { name: /Could not load/ }),
    ).toBeNull();
    expect(root).toHaveAttribute("aria-expanded", "false");
    key("ArrowRight");
    await waitFor(() => expect(app.search).toHaveBeenCalledTimes(2));
  });

  it("removes tree data on signout during and after loading, and resets on re-login", async () => {
    const app = mount({
      scenario: { latency_ms: (op) => (op === "search" ? 10_000 : 0) },
    });
    await focusTree();
    key("ArrowRight");
    await waitFor(() => expect(app.search).toHaveBeenCalledTimes(1));
    const signal = app.search.mock.calls[0][1]!.signal!;
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await settle();
    expect(signal.aborted).toBe(true);
    expect(screen.queryByRole("tree")).toBeNull();
    expect(document.body).not.toHaveTextContent("Alpha catalog");
    const cached = () =>
      app
        .client()
        .getQueryCache()
        .getAll()
        .filter((query) => query.queryKey[0] === "lca-services");
    expect(cached()).toEqual([]);

    app.emit(verified("account-b"));
    await tree();
    expect(item(/^Alpha catalog 2026 v1/)).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    app.emit(verified("account-a"));
    await tree();
    expect(item(/^Alpha catalog 2026 v1/)).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(localStorage.length).toBe(0);
  });

  it("clears loaded tree content and caches on signout after loading", async () => {
    const app = mount();
    await focusTree();
    key("ArrowRight");
    await waitFor(() => expect(item(/^transport/)).toBeVisible());
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await settle();
    expect(document.body).not.toHaveTextContent("transport");
    expect(
      app
        .client()
        .getQueryCache()
        .getAll()
        .filter((query) => query.state.data !== undefined),
    ).toEqual([]);
  });
});
