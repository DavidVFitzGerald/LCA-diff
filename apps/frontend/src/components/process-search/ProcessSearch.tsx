import { useEffect, useRef, useState } from "react";
import type { SearchFields } from "../../services/contracts";
import {
  emptyDraft,
  normalizeFields,
  SEARCH_DEBOUNCE_MS,
  SEARCH_FIELD_MAX_LENGTH,
  SEARCH_FIELDS,
} from "./fields";
import type { SearchDraft } from "./fields";
import "./process-search.css";

/**
 * Process search fields (#17). Emits normalized fields after a short debounce;
 * Clear applies immediately. State is in memory only (D6).
 */
export function ProcessSearch({
  onChange,
}: {
  onChange: (fields: SearchFields) => void;
}) {
  const [draft, setDraft] = useState<SearchDraft>(emptyDraft);
  const [advanced, setAdvanced] = useState(false);
  const primary = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(onChange);
  useEffect(() => {
    latest.current = onChange;
  }, [onChange]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function update(name: keyof SearchDraft, value: string) {
    const next = { ...draft, [name]: value };
    setDraft(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      latest.current(normalizeFields(next));
    }, SEARCH_DEBOUNCE_MS);
  }
  function clear() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setDraft(emptyDraft());
    latest.current({});
    primary.current?.focus();
  }
  const hasText = Object.values(draft).some((value) => value !== "");
  const input = (name: keyof SearchDraft, label: string, first = false) => (
    <div className="search-field" key={name}>
      <label htmlFor={`search-${name}`}>{label}</label>
      <input
        id={`search-${name}`}
        ref={first ? primary : undefined}
        type="text"
        autoComplete="off"
        spellCheck={false}
        maxLength={SEARCH_FIELD_MAX_LENGTH}
        value={draft[name]}
        onChange={(event) => update(name, event.target.value)}
      />
    </div>
  );

  return (
    <div className="process-search" role="search" aria-label="Process search">
      <div className="search-primary">
        {input("process_name", "Process Name", true)}
        {hasText && (
          <button
            type="button"
            className="search-clear"
            aria-label="Clear search"
            title="Clear search"
            onClick={clear}
          >
            ×
          </button>
        )}
      </div>
      <button
        type="button"
        className="search-advanced-toggle"
        aria-expanded={advanced}
        aria-controls="search-advanced"
        onClick={() => setAdvanced(!advanced)}
      >
        Advanced search
      </button>
      <div id="search-advanced" hidden={!advanced}>
        {SEARCH_FIELDS.filter(([name]) => name !== "process_name").map(
          ([name, label]) => input(name, label),
        )}
      </div>
    </div>
  );
}
