import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, useQueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { App } from "../../App";
import { ApplicationProviders } from "../../app/ApplicationProviders";
import { createApplication } from "../../app/composition";
import { useEffect } from "react";
import { IndicatorProvider } from "../../app/indicators";
import { useIndicators } from "../../app/indicator-context";
import { SelectionProvider, useSelection } from "../../app/selection";
import { IndicatorTree } from "../../components/indicator-tree/IndicatorTree";
import type {
  AuthState,
  IndicatorTree as Tree,
  ServiceResult,
} from "../contracts";
import { createSyntheticFixtures, FIXTURE_IDS } from "./fixtures";

const fixtures = createSyntheticFixtures();
const baseTree = fixtures.revisions[1].indicator_tree;
const verified = (uid = "a"): AuthState => ({
  status: "authenticated",
  user: { uid, email: `${uid}@example.invalid`, email_verified: true },
});
function Probe() {
  const { ids } = useIndicators();
  const { entries, store } = useSelection();
  return (
    <>
      <output aria-label="Selected indicator IDs">{JSON.stringify(ids)}</output>
      <output aria-label="Process count">{entries.length}</output>
      <button
        onClick={() =>
          store.select({
            id: "p",
            release_id: "r",
            revision_id: "v",
            name: "P",
            geography: "CH",
            path: [],
          })
        }
      >
        Add process
      </button>
      <IndicatorTree />
    </>
  );
}
function mount(initial = verified(), app = false) {
  const base = createApplication("mock");
  let state = initial;
  let observer: (state: AuthState) => void = () => {};
  let response: ServiceResult<Tree> = { ok: true, data: baseTree };
  let delay: Promise<void> | undefined;
  const indicatorTree = vi.fn(async () => {
    await delay;
    return response;
  });
  const releases = vi.fn(async () => ({
    ok: true as const,
    data: {
      items: fixtures.releases,
      next_cursor: null,
      total_count: 1,
      revision_snapshot: baseTree.revision_snapshot,
      request_id: "test",
    },
  }));
  const auth = {
    ...base.services.auth,
    observe(next: (state: AuthState) => void) {
      observer = next;
      queueMicrotask(() => observer(state));
      return () => {
        observer = () => {};
      };
    },
  };
  let client!: QueryClient;
  function Capture() {
    const value = useQueryClient();
    useEffect(() => {
      client = value;
    }, [value]);
    return null;
  }
  function Protected() {
    return state.status === "authenticated" && state.user.email_verified ? (
      <SelectionProvider key={state.user.uid}>
        <IndicatorProvider>
          <Probe />
        </IndicatorProvider>
      </SelectionProvider>
    ) : null;
  }
  const runtime = {
    mode: "test" as const,
    services: {
      ...base.services,
      auth,
      data: { ...base.services.data, releases, indicatorTree },
    },
  };
  const content = () => (
    <ApplicationProviders runtime={runtime}>
      {app ? <App /> : <Protected />}
      <Capture />
    </ApplicationProviders>
  );
  const view = render(content());
  return {
    indicatorTree,
    releases,
    emit(next: AuthState) {
      act(() => {
        state = next;
        observer(state);
        view.rerender(content());
      });
    },
    response(next: ServiceResult<Tree>) {
      response = next;
    },
    hold(next: Promise<void> | undefined) {
      delay = next;
    },
    refresh: () =>
      client.invalidateQueries({
        predicate: (query) => query.queryKey.includes("indicatorTree"),
      }),
    client: () => client,
  };
}
const ids = () =>
  JSON.parse(
    screen.getByLabelText("Selected indicator IDs").textContent!,
  ) as string[];
const node = (name: string | RegExp) => screen.getByRole("treeitem", { name });
const clickCheck = (name: string) =>
  fireEvent.click(screen.getByRole("checkbox", { name: `Select ${name}` }));

describe("indicator selection and hierarchy", () => {
  it("initializes only the default before any processes and uses flat/native optional-category hierarchy", async () => {
    mount();
    await screen.findByRole("tree", { name: "Indicators" });
    expect(ids()).toEqual([FIXTURE_IDS.gwp]);
    expect(screen.getByLabelText("Process count")).toHaveTextContent("0");
    expect(node("IPCC 2021")).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("button", { name: "Expand IPCC 2021" }));
    expect(node("GWP 100 [kg CO2-eq]")).toHaveAttribute("aria-level", "2");
    fireEvent.click(
      screen.getByRole("button", { name: "Expand Synthetic method" }),
    );
    expect(node("Synthetic category")).toHaveAttribute("aria-level", "2");
    fireEvent.click(
      screen.getByRole("button", { name: "Expand Synthetic category" }),
    );
    expect(node("A synthetic indicator [synthetic points]")).toHaveAttribute(
      "aria-level",
      "3",
    );
    clickCheck("Synthetic category");
    expect(ids()).toEqual([FIXTURE_IDS.gwp, FIXTURE_IDS.otherIndicator]);
    clickCheck("Synthetic method");
    expect(ids()).toEqual([FIXTURE_IDS.gwp]);
  });

  it("bulk selects all descendants, reflects mixed parents and canonical source order rather than label/click order", async () => {
    const app = mount();
    const original = baseTree.methods[1];
    const first = original.categories[0].indicators[0];
    app.response({
      ok: true,
      data: {
        ...baseTree,
        methods: [
          baseTree.methods[0],
          {
            ...original,
            categories: [
              {
                ...original.categories[0],
                indicators: [
                  {
                    ...first,
                    id: "late",
                    name: "A first alphabetically",
                    source_order: 9,
                  },
                  {
                    ...first,
                    id: "early",
                    name: "Z last alphabetically",
                    source_order: 2,
                  },
                ],
              },
            ],
          },
        ],
      },
    });
    await screen.findByRole("tree", { name: "Indicators" });
    await act(app.refresh);
    clickCheck("IPCC 2021");
    fireEvent.click(
      screen.getByRole("button", { name: "Expand Synthetic method" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Expand Synthetic category" }),
    );
    clickCheck("A first alphabetically [synthetic points]");
    expect(node("Synthetic method")).toHaveAttribute("aria-checked", "mixed");
    expect(node("Synthetic category")).toHaveAttribute("aria-checked", "mixed");
    clickCheck("Z last alphabetically [synthetic points]");
    clickCheck("IPCC 2021");
    expect(ids()).toEqual([FIXTURE_IDS.gwp, "early", "late"]);
    fireEvent.click(screen.getByRole("button", { name: "Add process" }));
    expect(ids()).toEqual([FIXTURE_IDS.gwp, "early", "late"]);
    clickCheck("Synthetic method");
    expect(ids()).toEqual([FIXTURE_IDS.gwp]);
  });

  it("supports roving tree focus, disclosure and descendant selection from the keyboard", async () => {
    mount();
    await screen.findByRole("tree", { name: "Indicators" });
    const root = node("IPCC 2021");
    act(() => root.focus());
    fireEvent.keyDown(root, { key: "ArrowRight" });
    fireEvent.keyDown(root, { key: "ArrowRight" });
    expect(node("GWP 100 [kg CO2-eq]")).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: " " });
    expect(ids()).toEqual([]);
    fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
    expect(root).toHaveFocus();
    fireEvent.keyDown(root, { key: "ArrowLeft" });
    expect(root).toHaveAttribute("aria-expanded", "false");
    fireEvent.keyDown(root, { key: "End" });
    expect(node("Synthetic method")).toHaveFocus();
    expect(
      document.querySelectorAll('[role="treeitem"][tabindex="0"]'),
    ).toHaveLength(1);
  });

  it("keeps choices and processes during loading/error/empty retry and does not re-default intentional deselection", async () => {
    const app = mount();
    await screen.findByRole("tree", { name: "Indicators" });
    clickCheck("Synthetic method");
    clickCheck("IPCC 2021");
    fireEvent.click(screen.getByRole("button", { name: "Add process" }));
    let finish!: () => void;
    app.hold(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    let refresh!: Promise<void>;
    act(() => {
      refresh = app.refresh();
    });
    await screen.findByText("Loading indicators…");
    expect(ids()).toEqual([FIXTURE_IDS.otherIndicator]);
    app.response({
      ok: false,
      error: {
        code: "TEMPORARILY_UNAVAILABLE",
        message: "test",
        request_id: "test",
        retryable: true,
      },
    });
    await act(async () => {
      finish();
      await refresh;
    });
    await screen.findByRole("alert");
    expect(ids()).toEqual([FIXTURE_IDS.otherIndicator]);
    app.hold(undefined);
    app.response({ ok: true, data: { ...baseTree, methods: [] } });
    fireEvent.click(screen.getByRole("button", { name: "Retry indicators" }));
    await screen.findByText(/No indicators are available/);
    expect(ids()).toEqual([FIXTURE_IDS.otherIndicator]);
    expect(screen.getByLabelText("Process count")).toHaveTextContent("1");
    app.response({ ok: true, data: { ...baseTree } });
    fireEvent.click(screen.getByRole("button", { name: "Retry indicators" }));
    await screen.findByRole("tree", { name: "Indicators" });
    expect(ids()).toEqual([FIXTURE_IDS.otherIndicator]);
    clickCheck("Synthetic method");
    expect(ids()).toEqual([]);
    app.response({ ok: true, data: { ...baseTree, request_id: "refresh" } });
    await act(app.refresh);
    expect(ids()).toEqual([]);
  });

  it("fetches and renders nothing while signed out/unverified and resets indicator choices across accounts", async () => {
    const app = mount({ status: "unauthenticated" }, true);
    await screen.findByRole("dialog");
    expect(app.indicatorTree).not.toHaveBeenCalled();
    expect(screen.queryByRole("tree", { name: "Indicators" })).toBeNull();
    app.emit({
      status: "authenticated",
      user: { uid: "a", email: "a@example.invalid", email_verified: false },
    });
    expect(app.indicatorTree).not.toHaveBeenCalled();
    app.emit(verified());
    await waitFor(() => expect(app.indicatorTree).toHaveBeenCalledTimes(1));
    // Provider initializes while Flows is still active, with zero processes.
    expect(
      screen.queryByRole("complementary", { name: "Indicator selection" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Scores" }));
    await screen.findByRole("tree", { name: "Indicators" });
    clickCheck("IPCC 2021");
    fireEvent.click(
      screen.getByRole("button", { name: "Collapse indicators" }),
    );
    fireEvent.click(screen.getByRole("tab", { name: "Flows" }));
    fireEvent.click(screen.getByRole("tab", { name: "Scores" }));
    fireEvent.click(screen.getByRole("button", { name: "Expand indicators" }));
    expect(node("IPCC 2021")).toHaveAttribute("aria-checked", "false");
    app.emit(verified("b"));
    fireEvent.click(screen.getByRole("tab", { name: "Scores" }));
    await waitFor(() =>
      expect(node("IPCC 2021")).toHaveAttribute("aria-checked", "true"),
    );
    app.emit({ status: "unauthenticated" });
    expect(screen.queryByRole("tree", { name: "Indicators" })).toBeNull();
    expect(app.client().getQueryCache().getAll()).toHaveLength(0);
  });
});
