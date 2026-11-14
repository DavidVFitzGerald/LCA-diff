/** Entirely invented data. No BAFU/provider rows, scores or identifiers were copied. */
import { decimalString, flowRowKey } from "../contracts";
import type {
  FlowCell,
  FlowRow,
  Indicator,
  IndicatorTree,
  ProcessHeader,
  Release,
  RevisionRef,
  RevisionSnapshot,
  ScoreCell,
} from "../contracts";

export const SYNTHETIC_PROVENANCE = {
  kind: "synthetic",
  description:
    "Invented contract examples; not an import or reproduction of BAFU.",
} as const;

export const FIXTURE_IDS = {
  release: "10000000-0000-4000-8000-000000000001",
  revisions: [
    "20000000-0000-4000-8000-000000000001",
    "20000000-0000-4000-8000-000000000002",
  ],
  reference: "30000000-0000-5000-8000-000000000001",
  referenceBeta: "30000000-0000-5000-8000-000000000006",
  referenceGamma: "30000000-0000-5000-8000-000000000007",
  technosphere: "30000000-0000-5000-8000-000000000002",
  airLow: "30000000-0000-5000-8000-000000000003",
  airHigh: "30000000-0000-5000-8000-000000000004",
  water: "30000000-0000-5000-8000-000000000005",
  gwp: "40000000-0000-4000-8000-000000000001",
  otherIndicator: "40000000-0000-4000-8000-000000000002",
} as const;

export interface FixtureRevision {
  readonly revision: RevisionRef;
  readonly revision_snapshot: RevisionSnapshot;
  readonly headers: readonly ProcessHeader[];
  readonly flow_rows: readonly FlowRow[];
  readonly flow_cells: readonly FlowCell[];
  readonly score_cells: readonly ScoreCell[];
  readonly indicator_tree: IndicatorTree;
}
export interface SyntheticFixtures {
  readonly provenance: typeof SYNTHETIC_PROVENANCE;
  readonly releases: readonly Release[];
  readonly revisions: readonly FixtureRevision[];
  /** Fixture-only evidence that equal source-like numbers are not flow identities. */
  readonly source_labels: readonly {
    readonly flow_id: string;
    readonly source_number: string;
    readonly compartment: string;
  }[];
}

function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

/** Fresh and deeply frozen on every invocation; no clocks, randomness or I/O. */
export function createSyntheticFixtures(): SyntheticFixtures {
  const definitions: readonly Omit<FlowRow, "row_key" | "sort_key">[] = [
    {
      flow_id: FIXTURE_IDS.reference,
      flow_type: "Reference",
      name: "Synthetic transport service",
      location: "CH",
      process_name: "Synthetic road service Alpha",
      category: "transport systems",
      subcategory: "road\\operations",
      unit: "km",
    },
    {
      flow_id: FIXTURE_IDS.referenceBeta,
      flow_type: "Reference",
      name: "Synthetic transport service",
      location: "DE",
      process_name: "Synthetic road service Beta",
      category: "transport systems",
      subcategory: "road\\operations\\infrastructure",
      unit: "km",
    },
    {
      flow_id: FIXTURE_IDS.referenceGamma,
      flow_type: "Reference",
      name: "Synthetic transport service",
      location: "CH",
      process_name: "Synthetic road service Gamma",
      category: "transport systems",
      subcategory: "road\\operations",
      unit: "m",
    },
    {
      flow_id: FIXTURE_IDS.technosphere,
      flow_type: "Technosphere",
      name: "Synthetic recovered material",
      location: "CH",
      process_name: "Synthetic supplier",
      category: "materials",
      subcategory: "recovered",
      unit: "kg",
    },
    {
      flow_id: FIXTURE_IDS.water,
      flow_type: "Ecosphere Input",
      name: "Synthetic water",
      location: null,
      process_name: null,
      category: "water",
      subcategory: "river",
      unit: "kg",
    },
    {
      flow_id: FIXTURE_IDS.airLow,
      flow_type: "Ecosphere Output",
      name: "Synthetic trace emission",
      location: null,
      process_name: null,
      category: "air",
      subcategory: "lower atmosphere",
      unit: "kg",
    },
    {
      flow_id: FIXTURE_IDS.airHigh,
      flow_type: "Ecosphere Output",
      name: "Synthetic trace emission",
      location: null,
      process_name: null,
      category: "air",
      subcategory: "upper atmosphere",
      unit: "kg",
    },
  ];
  const typeOrder = [
    "Reference",
    "Technosphere",
    "Ecosphere Input",
    "Ecosphere Output",
  ];
  const rows: readonly FlowRow[] = definitions
    .map((row) => ({
      ...row,
      row_key: flowRowKey(row.flow_id, row.flow_type),
      sort_key: [
        row.category.toLowerCase(),
        row.subcategory.toLowerCase(),
        row.name.toLowerCase(),
        row.flow_id,
      ],
    }))
    .sort((a, b) => {
      const typeDifference =
        typeOrder.indexOf(a.flow_type) - typeOrder.indexOf(b.flow_type);
      if (typeDifference !== 0) return typeDifference;
      for (let index = 0; index < a.sort_key.length; index += 1) {
        if (a.sort_key[index] < b.sort_key[index]) return -1;
        if (a.sort_key[index] > b.sort_key[index]) return 1;
      }
      return 0;
    });
  const indicators: readonly Indicator[] = [
    {
      id: FIXTURE_IDS.gwp,
      release_id: FIXTURE_IDS.release,
      method_id: "synthetic-ipcc",
      method_name: "IPCC 2021",
      method_version: "2021",
      category: null,
      name: "GWP 100",
      unit: "kg CO2-eq",
      source_order: 0,
    },
    {
      id: FIXTURE_IDS.otherIndicator,
      release_id: FIXTURE_IDS.release,
      method_id: "synthetic-method",
      method_name: "Synthetic method",
      method_version: "1",
      category: "Synthetic category",
      name: "A synthetic indicator",
      unit: "synthetic points",
      source_order: 1,
    },
  ];
  const revisions = FIXTURE_IDS.revisions.map(
    (revision_id, revisionIndex): FixtureRevision => {
      const revision = { release_id: FIXTURE_IDS.release, revision_id };
      const headers: readonly ProcessHeader[] = [
        {
          name: "Synthetic road service Alpha",
          geography: "CH",
          reference_amount: decimalString("1"),
          reference_unit: "km",
          category_path: ["transport systems", "road", "operations"],
        },
        {
          name: "Synthetic road service Beta",
          geography: "DE",
          reference_amount: decimalString("2.0000000000000000000000001"),
          reference_unit: "km",
          category_path: [
            "transport systems",
            "road",
            "operations",
            "infrastructure",
          ],
        },
        {
          name: "Synthetic road service Gamma",
          geography: "CH",
          reference_amount: decimalString("1"),
          reference_unit: "m",
          category_path: ["transport systems", "road", "operations"],
        },
      ].map((header, index) => ({
        ...revision,
        ...header,
        id: `50000000-0000-4000-8000-0000000000${revisionIndex + 1}${index + 1}`,
        category: "transport systems",
        subcategory: header.category_path.slice(1).join("\\"),
        reference_flow_name: "Synthetic transport service",
        warnings: [],
      }));
      const flow_cells = headers.flatMap((header, processIndex): FlowCell[] =>
        rows.map((row): FlowCell => {
          const base = {
            process_id: header.id,
            row_key: row.row_key,
            warnings:
              row.flow_id === FIXTURE_IDS.technosphere && processIndex === 0
                ? [
                    {
                      code: "AGGREGATED_DUPLICATES",
                      message:
                        "Synthetic duplicate exchanges aggregated during ingestion",
                    },
                  ]
                : [],
          };
          if (
            (row.flow_type === "Reference" &&
              row.process_name !== header.name) ||
            (row.flow_id === FIXTURE_IDS.airHigh && processIndex === 1)
          )
            return { ...base, present: false, amount: null };
          const amount =
            row.flow_type === "Reference"
              ? header.reference_amount
              : row.flow_id === FIXTURE_IDS.technosphere
                ? processIndex === 0
                  ? "-80.000000000000000000000001"
                  : "20"
                : row.flow_id === FIXTURE_IDS.water
                  ? "0"
                  : row.flow_id === FIXTURE_IDS.airLow
                    ? revisionIndex === 0
                      ? "0.000000000000000000000000000000123456789"
                      : "0.000000000000000000000000000000123456790"
                    : "-0";
          return {
            ...base,
            present: true,
            amount: decimalString(amount),
          };
        }),
      );
      const score_cells = headers.flatMap((header, processIndex): ScoreCell[] =>
        indicators.map((indicator): ScoreCell => {
          const base = {
            process_id: header.id,
            indicator_id: indicator.id,
            warnings: [],
          };
          if (processIndex === 1)
            return { ...base, status: "missing", amount: null };
          if (processIndex === 2)
            return {
              ...base,
              status: "unresolved_basis",
              amount: null,
              warnings: [
                {
                  code: "UNVERIFIED_SCORE_BASIS",
                  message:
                    "Synthetic unverified reference basis; no conversion applied",
                },
              ],
            };
          return {
            ...base,
            status: "valid",
            amount: decimalString(
              indicator.source_order === 0
                ? "0"
                : "123456789012345678901234567890.1234567890123456789",
            ),
          };
        }),
      );
      return {
        revision,
        revision_snapshot: [revision],
        headers,
        flow_rows: rows,
        flow_cells,
        score_cells,
        indicator_tree: {
          revision_snapshot: [revision],
          request_id: `synthetic-indicators-${revisionIndex + 1}`,
          default_indicator_ids: [FIXTURE_IDS.gwp],
          methods: [
            {
              id: "synthetic-ipcc",
              release_id: FIXTURE_IDS.release,
              name: "IPCC 2021",
              version: "2021",
              source_order: 0,
              indicators: [indicators[0]],
              categories: [],
            },
            {
              id: "synthetic-method",
              release_id: FIXTURE_IDS.release,
              name: "Synthetic method",
              version: "1",
              source_order: 1,
              indicators: [],
              categories: [
                {
                  id: "synthetic-category",
                  name: "Synthetic category",
                  source_order: 0,
                  indicators: [indicators[1]],
                },
              ],
            },
          ],
        },
      };
    },
  );
  return freeze({
    provenance: { ...SYNTHETIC_PROVENANCE },
    releases: [
      {
        ...revisions[1].revision,
        database_code: "SYNTHETIC",
        version: "fixture v1",
        display_name: "Synthetic precision fixture",
        published_at: null,
      },
    ],
    revisions,
    source_labels: [
      {
        flow_id: FIXTURE_IDS.airLow,
        source_number: "example-42",
        compartment: "air/lower atmosphere",
      },
      {
        flow_id: FIXTURE_IDS.airHigh,
        source_number: "example-42",
        compartment: "air/upper atmosphere",
      },
    ],
  });
}
