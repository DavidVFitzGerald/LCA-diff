import { decimalString, flowRowKey } from "../contracts";
import type {
  FlowRow,
  FlowValue,
  IndicatorTree,
  ProcessHeader,
  PublicWarning,
  Release,
  RevisionRef,
  ScoreValue,
} from "../contracts";
import { createDiscoveryCatalog } from "./discovery";
import { createSyntheticFixtures } from "./fixtures";

export type FixtureFlowValue = FlowValue & {
  readonly warnings: readonly PublicWarning[];
};
export type FixtureScoreValue = ScoreValue & {
  readonly warnings: readonly PublicWarning[];
};
export interface ComparisonProcess {
  readonly header: ProcessHeader;
  readonly flows: Readonly<Record<string, FixtureFlowValue>>;
  readonly scores: Readonly<Record<string, FixtureScoreValue>>;
}
export interface ComparisonRevision {
  readonly revision: RevisionRef;
  readonly processes: readonly ComparisonProcess[];
  readonly flow_rows: readonly FlowRow[];
  readonly shared_flows: Readonly<Record<string, FixtureFlowValue>>;
  readonly indicator_tree: IndicatorTree;
}
export interface ComparisonCatalog {
  readonly releases: readonly Release[];
  readonly revisions: readonly ComparisonRevision[];
}

/** Invented sparse comparison data, not BAFU or an LCIA calculation. */
export function createComparisonCatalog(
  processCount = 3,
  additionalFlowCount = 0,
): ComparisonCatalog {
  if (!Number.isSafeInteger(additionalFlowCount) || additionalFlowCount < 0)
    throw new TypeError("Invalid synthetic row count");
  const base = createSyntheticFixtures();
  const discovery = createDiscoveryCatalog(processCount);
  return {
    releases: base.releases,
    revisions: base.revisions.map((fixture, revisionIndex) => {
      const rows = [...fixture.flow_rows];
      const shared_flows: Record<string, FixtureFlowValue> = {};
      for (let index = 0; index < additionalFlowCount; index += 1) {
        const flow_id = `synthetic-extra-flow:${index}`;
        const row_key = flowRowKey(flow_id, "Ecosphere Output");
        const name = `Synthetic generated flow ${String(index).padStart(6, "0")}`;
        rows.push({
          flow_id,
          row_key,
          flow_type: "Ecosphere Output",
          name,
          location: null,
          process_name: null,
          category: "synthetic compartment",
          subcategory: "synthetic subcompartment",
          unit: "kg",
          sort_key: [
            "synthetic compartment",
            "synthetic subcompartment",
            name.toLowerCase(),
            flow_id,
          ],
        });
        shared_flows[row_key] = {
          present: true,
          amount: decimalString(
            index % 2 === 0
              ? "0.000000000000000000000123456789"
              : "-100000000000000000000.0000001",
          ),
          warnings: [],
        };
      }
      const processes = discovery.revisions[revisionIndex].headers.map(
        (header, index): ComparisonProcess => {
          const template = fixture.headers[index % fixture.headers.length];
          const flows: Record<string, FixtureFlowValue> = {};
          for (const cell of fixture.flow_cells.filter(
            (cell) => cell.process_id === template.id,
          )) {
            if (cell.row_key.endsWith("|Reference")) continue;
            flows[cell.row_key] = cell.present
              ? { present: true, amount: cell.amount, warnings: cell.warnings }
              : { present: false, amount: null, warnings: cell.warnings };
          }
          const templateReference = fixture.flow_rows.find(
            (row) =>
              row.flow_type === "Reference" &&
              row.process_name === template.name,
          )!;
          const flow_id =
            index < fixture.headers.length
              ? templateReference.flow_id
              : `synthetic-reference:${index}`;
          const row_key = flowRowKey(flow_id, "Reference");
          if (index >= fixture.headers.length)
            rows.push({
              ...templateReference,
              flow_id,
              row_key,
              process_name: header.name,
              sort_key: [...templateReference.sort_key.slice(0, -1), flow_id],
            });
          flows[row_key] = {
            present: true,
            amount: header.reference_amount,
            warnings: [],
          };
          const scores: Record<string, FixtureScoreValue> = {};
          for (const cell of fixture.score_cells.filter(
            (cell) => cell.process_id === template.id,
          ))
            scores[cell.indicator_id] =
              cell.status === "valid"
                ? {
                    status: "valid",
                    amount: cell.amount,
                    warnings: cell.warnings,
                  }
                : {
                    status: cell.status,
                    amount: null,
                    warnings: cell.warnings,
                  };
          return { header, flows, scores };
        },
      );
      return {
        revision: fixture.revision,
        processes,
        flow_rows: rows,
        shared_flows,
        indicator_tree: fixture.indicator_tree,
      };
    }),
  };
}
