import { useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useIndicators } from "../../app/indicator-context";
import type { Indicator, IndicatorId } from "../../services/contracts";
import "./indicator-tree.css";

interface Node {
  key: string;
  name: string;
  order: number;
  ids: readonly IndicatorId[];
  children: readonly Node[];
}
const leaf = (indicator: Indicator): Node => ({
  key: `indicator:${indicator.id}`,
  name: `${indicator.name} [${indicator.unit}]`,
  order: indicator.source_order,
  ids: [indicator.id],
  children: [],
});

export function IndicatorTree() {
  const { tree, ids, loading, error, retry, toggle } = useIndicators();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [focused, setFocused] = useState<string | null>(null);
  const elements = useRef(new Map<string, HTMLDivElement>());
  const roots: Node[] = [...(tree?.methods ?? [])]
    .sort((a, b) => a.source_order - b.source_order)
    .map((method) => {
      const children = [
        ...[...method.indicators]
          .sort((a, b) => a.source_order - b.source_order)
          .map(leaf),
        ...[...method.categories]
          .sort((a, b) => a.source_order - b.source_order)
          .map((category): Node => ({
            key: `category:${method.release_id}:${method.id}:${category.id}`,
            name: category.name,
            order: category.source_order,
            ids: category.indicators.map(({ id }) => id),
            children: [...category.indicators]
              .sort((a, b) => a.source_order - b.source_order)
              .map(leaf),
          })),
      ].sort((a, b) => a.order - b.order);
      return {
        key: `method:${method.release_id}:${method.id}`,
        name: method.name,
        order: method.source_order,
        ids: children.flatMap((child) => child.ids),
        children,
      };
    });
  const visible: { node: Node; parent: string | null }[] = [];
  function visit(nodes: readonly Node[], parent: string | null) {
    nodes.forEach((node) => {
      visible.push({ node, parent });
      if (expanded.has(node.key)) visit(node.children, node.key);
    });
  }
  visit(roots, null);
  const active = visible.some(({ node }) => node.key === focused)
    ? focused
    : visible[0]?.node.key;
  function expand(key: string) {
    setExpanded((before) => {
      const next = new Set(before);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  function focus(key: string | undefined | null) {
    if (!key) return;
    setFocused(key);
    elements.current.get(key)?.focus();
  }
  function keyDown(event: KeyboardEvent, node: Node) {
    const index = visible.findIndex((row) => row.node.key === node.key);
    switch (event.key) {
      case "ArrowDown":
        focus(visible[index + 1]?.node.key);
        break;
      case "ArrowUp":
        focus(visible[index - 1]?.node.key);
        break;
      case "Home":
        focus(visible[0]?.node.key);
        break;
      case "End":
        focus(visible.at(-1)?.node.key);
        break;
      case "ArrowRight":
        if (node.children.length && !expanded.has(node.key)) expand(node.key);
        else focus(node.children[0]?.key);
        break;
      case "ArrowLeft":
        if (expanded.has(node.key)) expand(node.key);
        else focus(visible[index]?.parent);
        break;
      case "Enter":
        if (node.children.length) expand(node.key);
        else toggle(node.ids);
        break;
      case " ":
        toggle(node.ids);
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
  }
  function render(nodes: readonly Node[], level: number) {
    return nodes.map((node) => {
      const selected = node.ids.filter((id) => ids.includes(id)).length;
      const checked =
        selected === 0 ? false : selected === node.ids.length ? true : "mixed";
      const branch = node.children.length > 0;
      return (
        <div
          key={node.key}
          role="treeitem"
          aria-label={node.name}
          aria-level={level}
          aria-posinset={nodes.indexOf(node) + 1}
          aria-setsize={nodes.length}
          aria-checked={checked}
          aria-expanded={branch ? expanded.has(node.key) : undefined}
          tabIndex={active === node.key ? 0 : -1}
          className="indicator-item"
          ref={(element) => {
            if (element) elements.current.set(node.key, element);
            else elements.current.delete(node.key);
          }}
          onFocus={(event) => {
            event.stopPropagation();
            setFocused(node.key);
          }}
          onKeyDown={(event) => keyDown(event, node)}
        >
          <div
            className="indicator-node"
            style={{ paddingInlineStart: `${(level - 1) * 14}px` }}
          >
            {branch ? (
              <button
                type="button"
                tabIndex={-1}
                aria-label={`${expanded.has(node.key) ? "Collapse" : "Expand"} ${node.name}`}
                aria-expanded={expanded.has(node.key)}
                onClick={() => {
                  focus(node.key);
                  expand(node.key);
                }}
              >
                {expanded.has(node.key) ? "▾" : "▸"}
              </button>
            ) : (
              <span className="indicator-spacer" />
            )}
            <button
              type="button"
              role="checkbox"
              aria-label={`Select ${node.name}`}
              aria-checked={checked}
              tabIndex={-1}
              className="indicator-check"
              onClick={() => {
                focus(node.key);
                toggle(node.ids);
              }}
            >
              {checked === "mixed" ? "−" : checked ? "✓" : ""}
            </button>
            <span
              onClick={() => {
                focus(node.key);
                toggle(node.ids);
              }}
            >
              {node.name}
            </span>
          </div>
          {branch && expanded.has(node.key) && (
            <div role="group">{render(node.children, level + 1)}</div>
          )}
        </div>
      );
    });
  }
  return (
    <div className="indicator-selector" aria-busy={loading}>
      {loading && <p role="status">Loading indicators…</p>}
      {error && (
        <p role="alert">
          Indicators could not be loaded. Your selections are kept.
        </p>
      )}
      {!loading && !error && !roots.length && (
        <p role="status">
          No indicators are available. Your selections are kept.
        </p>
      )}
      {(error || (!loading && !roots.length)) && (
        <button type="button" onClick={retry}>
          Retry indicators
        </button>
      )}
      {roots.length > 0 && (
        <div role="tree" aria-label="Indicators">
          {render(roots, 1)}
        </div>
      )}
    </div>
  );
}
