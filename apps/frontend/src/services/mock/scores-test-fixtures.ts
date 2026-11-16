/** Invented Scores stress fixture, used only by service/component tests. */
import { decimalString } from "../contracts";
import type { Indicator } from "../contracts";
import { createComparisonCatalog } from "./comparison-fixtures";
import type {
  ComparisonCatalog,
  FixtureScoreValue,
} from "./comparison-fixtures";

export const PRECISE = "20.000000000000000000000001";
export const negative = "-80.000000000000000000000004";
export function scoresCatalog(processes = 220, rows = 230): ComparisonCatalog {
  const base = createComparisonCatalog(processes);
  return {
    ...base,
    revisions: base.revisions.map((revision, r) => {
      const template = revision.indicator_tree.methods[0].indicators[0];
      const indicators: Indicator[] = Array.from({ length: rows }, (_, i) => ({
        ...template,
        id: `score:${i}`,
        name:
          i === 0
            ? "Z first source indicator"
            : `A indicator ${String(i).padStart(4, "0")}`,
        source_order: i,
      }));
      return {
        ...revision,
        indicator_tree: {
          ...revision.indicator_tree,
          default_indicator_ids: [indicators[0].id],
          methods: [
            {
              ...revision.indicator_tree.methods[0],
              indicators,
              categories: [],
            },
          ],
        },
        processes: revision.processes.map((process, p) => ({
          ...process,
          scores: Object.fromEntries(
            indicators.map((indicator, i): [string, FixtureScoreValue] => {
              if (p < processes - 2 && p % 6 === 1)
                return [
                  indicator.id,
                  { status: "missing", amount: null, warnings: [] },
                ];
              if (p < processes - 2 && p % 6 === 2)
                return [
                  indicator.id,
                  {
                    status: "unresolved_basis",
                    amount: null,
                    warnings: [
                      {
                        code: "UNVERIFIED_SCORE_BASIS",
                        message: "Synthetic basis unverified",
                      },
                    ],
                  },
                ];
              return [
                indicator.id,
                {
                  status: "valid",
                  // Both extrema lie outside the initial mounted column window.
                  amount: decimalString(
                    r === 0
                      ? "1"
                      : p === processes - 1
                        ? negative
                        : p === processes - 2
                          ? PRECISE
                          : p % 6 === 0
                            ? "0"
                            : i % 2 === 0
                              ? "2"
                              : "-3",
                  ),
                  warnings: [],
                },
              ];
            }),
          ),
        })),
      };
    }),
  };
}
