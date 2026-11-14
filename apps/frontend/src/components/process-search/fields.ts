import type { SearchFields } from "../../services/contracts";

/** Reactive search debounce (spec §6.2.3: short, e.g. 200 ms). */
export const SEARCH_DEBOUNCE_MS = 200;
export const SEARCH_FIELD_MAX_LENGTH = 256;

export const SEARCH_FIELDS = [
  ["process_name", "Process Name"],
  ["geography", "Geography"],
  ["category", "Category"],
  ["subcategory", "Subcategory"],
  ["reference_flow_name", "Reference Flow Name"],
] as const satisfies readonly (readonly [keyof SearchFields, string])[];

export type SearchDraft = { readonly [K in keyof SearchFields]-?: string };
export const emptyDraft = (): SearchDraft => ({
  process_name: "",
  geography: "",
  category: "",
  subcategory: "",
  reference_flow_name: "",
});

/**
 * Normalizes harmless whitespace only (D2): trims and collapses runs of
 * whitespace and omits empty fields. Case, punctuation and token order are
 * sent literally; matching semantics belong to the search service.
 */
export function normalizeFields(draft: SearchDraft): SearchFields {
  const fields: Partial<Record<keyof SearchFields, string>> = {};
  for (const [name] of SEARCH_FIELDS) {
    const value = draft[name].trim().replace(/\s+/gu, " ");
    if (value) fields[name] = value;
  }
  return fields;
}
export const isFiltering = (fields: SearchFields) =>
  Object.keys(fields).length > 0;
