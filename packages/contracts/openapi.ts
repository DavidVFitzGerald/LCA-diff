// Generated from apps/api/openapi.json. Do not edit.
export interface paths {
    "/api/v1/comparison/flows/cells": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Flow Cells */
        post: operations["flow_cells_api_v1_comparison_flows_cells_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/comparison/flows/rows": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Flow Rows */
        post: operations["flow_rows_api_v1_comparison_flows_rows_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/comparison/scores/cells": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Score Cells */
        post: operations["score_cells_api_v1_comparison_scores_cells_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/comparison/scores/rows": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Score Rows */
        post: operations["score_rows_api_v1_comparison_scores_rows_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Health */
        get: operations["health_api_v1_health_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/indicators/tree": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Indicators */
        get: operations["indicators_api_v1_indicators_tree_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Me */
        get: operations["me_api_v1_me_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/metrics": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Operational Metrics */
        get: operations["operational_metrics_api_v1_metrics_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/processes/headers": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Headers */
        post: operations["headers_api_v1_processes_headers_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/processes/resolve-selection": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Resolve */
        post: operations["resolve_api_v1_processes_resolve_selection_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/processes/search": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Search */
        post: operations["search_api_v1_processes_search_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/ready": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Ready */
        get: operations["ready_api_v1_ready_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/releases": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Releases */
        get: operations["releases_api_v1_releases_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /** Cells[FlowCell] */
        Cells_FlowCell_: {
            /** Cells */
            cells: components["schemas"]["FlowCell"][];
            /** Comparison Token */
            comparison_token: string;
            /** Request Id */
            request_id: string;
            /** Revision Snapshot */
            revision_snapshot: components["schemas"]["RevisionRef"][];
        };
        /** Cells[ScoreCell] */
        Cells_ScoreCell_: {
            /** Cells */
            cells: components["schemas"]["ScoreCell"][];
            /** Comparison Token */
            comparison_token: string;
            /** Request Id */
            request_id: string;
            /** Revision Snapshot */
            revision_snapshot: components["schemas"]["RevisionRef"][];
        };
        /** ComparisonPage[FlowRow] */
        ComparisonPage_FlowRow_: {
            /** Comparison Token */
            comparison_token: string;
            /** Items */
            items: components["schemas"]["FlowRow"][];
            /** Next Cursor */
            next_cursor: string | null;
            /** Request Id */
            request_id: string;
            /** Revision Snapshot */
            revision_snapshot: components["schemas"]["RevisionRef"][];
            /** Total Count */
            total_count: number;
        };
        /** ComparisonPage[Indicator] */
        ComparisonPage_Indicator_: {
            /** Comparison Token */
            comparison_token: string;
            /** Items */
            items: components["schemas"]["Indicator"][];
            /** Next Cursor */
            next_cursor: string | null;
            /** Request Id */
            request_id: string;
            /** Revision Snapshot */
            revision_snapshot: components["schemas"]["RevisionRef"][];
            /** Total Count */
            total_count: number;
        };
        /** ErrorDetail */
        ErrorDetail: {
            /**
             * Code
             * @enum {string}
             */
            code: "AUTH_REQUIRED" | "EMAIL_NOT_VERIFIED" | "RELEASE_UNAVAILABLE" | "UNKNOWN_PROCESS" | "INVALID_FILTER" | "STALE_SNAPSHOT" | "REQUEST_WINDOW_TOO_LARGE" | "TEMPORARILY_UNAVAILABLE";
            /** Message */
            message: string;
            /** Request Id */
            request_id: string;
            /** Retryable */
            retryable: boolean;
        };
        /** ErrorResponse */
        ErrorResponse: {
            error: components["schemas"]["ErrorDetail"];
        };
        /** FlowCell */
        FlowCell: {
            /** Amount */
            amount: string | null;
            /** Present */
            present: boolean;
            /**
             * Process Id
             * Format: uuid
             */
            process_id: string;
            /** Row Key */
            row_key: string;
            /** Warnings */
            warnings: components["schemas"]["Warning"][];
        };
        /** FlowCellsRequest */
        FlowCellsRequest: {
            /** Comparison Token */
            comparison_token: string;
            /** Process Ids */
            process_ids: string[];
            /** Revision Snapshot */
            revision_snapshot: components["schemas"]["RevisionRef"][];
            /** Row Keys */
            row_keys: string[];
        };
        /** FlowRow */
        FlowRow: {
            /** Category */
            category: string;
            /**
             * Flow Id
             * Format: uuid
             */
            flow_id: string;
            flow_type: components["schemas"]["FlowType"];
            /** Location */
            location: string | null;
            /** Name */
            name: string;
            /** Process Name */
            process_name: string | null;
            /** Row Key */
            row_key: string;
            /** Sort Key */
            sort_key: string[];
            /** Subcategory */
            subcategory: string;
            summary: components["schemas"]["NumericSummary"];
            /** Unit */
            unit: string;
        };
        /**
         * FlowType
         * @enum {string}
         */
        FlowType: "Reference" | "Technosphere" | "Ecosphere Input" | "Ecosphere Output";
        /** Header */
        Header: {
            /** Category */
            category: string;
            /** Category Path */
            category_path: string[];
            /** Geography */
            geography: string;
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Name */
            name: string;
            /** Reference Amount */
            reference_amount: string;
            /** Reference Flow Name */
            reference_flow_name: string;
            /** Reference Unit */
            reference_unit: string;
            /**
             * Release Id
             * Format: uuid
             */
            release_id: string;
            /**
             * Revision Id
             * Format: uuid
             */
            revision_id: string;
            /** Subcategory */
            subcategory: string;
            /** Warnings */
            warnings: components["schemas"]["Warning"][];
        };
        /** HeadersRequest */
        HeadersRequest: {
            /** Process Ids */
            process_ids: string[];
            /** Revision Snapshot */
            revision_snapshot: components["schemas"]["RevisionRef"][];
        };
        /** Health */
        Health: {
            /**
             * Status
             * @default ok
             * @constant
             */
            status: "ok";
        };
        /** Identity */
        Identity: {
            /** Access */
            access?: {
                [key: string]: boolean;
            };
            /** Email */
            email: string;
            /**
             * Email Verified
             * @default true
             * @constant
             */
            email_verified: true;
            /** Uid */
            uid: string;
        };
        /** Indicator */
        Indicator: {
            /** Category */
            category: string | null;
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Method Id
             * Format: uuid
             */
            method_id: string;
            /** Method Name */
            method_name: string;
            /** Method Version */
            method_version: string;
            /** Name */
            name: string;
            /**
             * Release Id
             * Format: uuid
             */
            release_id: string;
            /** Source Order */
            source_order: number;
            summary?: components["schemas"]["NumericSummary"] | null;
            /** Unit */
            unit: string;
        };
        /** IndicatorCategory */
        IndicatorCategory: {
            /** Id */
            id: string;
            /** Indicators */
            indicators: components["schemas"]["Indicator"][];
            /** Name */
            name: string;
            /** Source Order */
            source_order: number;
        };
        /** IndicatorMethod */
        IndicatorMethod: {
            /** Categories */
            categories: components["schemas"]["IndicatorCategory"][];
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Indicators */
            indicators: components["schemas"]["Indicator"][];
            /** Name */
            name: string;
            /**
             * Release Id
             * Format: uuid
             */
            release_id: string;
            /** Source Order */
            source_order: number;
            /** Version */
            version: string;
        };
        /** IndicatorTree */
        IndicatorTree: {
            /** Default Indicator Ids */
            default_indicator_ids: string[];
            /** Methods */
            methods: components["schemas"]["IndicatorMethod"][];
            /** Request Id */
            request_id: string;
            /** Revision Snapshot */
            revision_snapshot: components["schemas"]["RevisionRef"][];
        };
        /** NumericSummary */
        NumericSummary: {
            /** Maximum */
            maximum: string | null;
            /** Minimum */
            minimum: string | null;
            /** Present Count */
            present_count: number;
            /** Selected Count */
            selected_count: number;
        };
        /** Page[Header] */
        Page_Header_: {
            /** Items */
            items: components["schemas"]["Header"][];
            /** Next Cursor */
            next_cursor: string | null;
            /** Request Id */
            request_id: string;
            /** Revision Snapshot */
            revision_snapshot: components["schemas"]["RevisionRef"][];
            /** Total Count */
            total_count: number;
        };
        /** Page[Release] */
        Page_Release_: {
            /** Items */
            items: components["schemas"]["Release"][];
            /** Next Cursor */
            next_cursor: string | null;
            /** Request Id */
            request_id: string;
            /** Revision Snapshot */
            revision_snapshot: components["schemas"]["RevisionRef"][];
            /** Total Count */
            total_count: number;
        };
        /** Page[SearchNode] */
        Page_SearchNode_: {
            /** Items */
            items: components["schemas"]["SearchNode"][];
            /** Next Cursor */
            next_cursor: string | null;
            /** Request Id */
            request_id: string;
            /** Revision Snapshot */
            revision_snapshot: components["schemas"]["RevisionRef"][];
            /** Total Count */
            total_count: number;
        };
        /** Page[str] */
        Page_str_: {
            /** Items */
            items: string[];
            /** Next Cursor */
            next_cursor: string | null;
            /** Request Id */
            request_id: string;
            /** Revision Snapshot */
            revision_snapshot: components["schemas"]["RevisionRef"][];
            /** Total Count */
            total_count: number;
        };
        /** Release */
        Release: {
            /** Database Code */
            database_code: string;
            /** Display Name */
            display_name: string;
            /** Published At */
            published_at: string | null;
            /**
             * Release Id
             * Format: uuid
             */
            release_id: string;
            /**
             * Revision Id
             * Format: uuid
             */
            revision_id: string;
            /** Version */
            version: string;
        };
        /** ResolveRequest */
        ResolveRequest: {
            /** Branch Path */
            branch_path?: string[] | null;
            /** Cursor */
            cursor?: string | null;
            fields?: components["schemas"]["SearchFields"];
            /**
             * Limit
             * @default 100
             */
            limit: number;
            /** Revision Snapshot */
            revision_snapshot: components["schemas"]["RevisionRef"][];
            /**
             * Scope
             * @enum {string}
             */
            scope: "all_matching" | "branch";
        };
        /** RevisionRef */
        RevisionRef: {
            /**
             * Release Id
             * Format: uuid
             */
            release_id: string;
            /**
             * Revision Id
             * Format: uuid
             */
            revision_id: string;
        };
        /** RowsRequest */
        RowsRequest: {
            /** Cursor */
            cursor?: string | null;
            /**
             * Differences Only
             * @default false
             */
            differences_only: boolean;
            /**
             * Limit
             * @default 100
             */
            limit: number;
            /** Process Ids */
            process_ids: string[];
            /** Revision Snapshot */
            revision_snapshot: components["schemas"]["RevisionRef"][];
        };
        /** ScoreCell */
        ScoreCell: {
            /** Amount */
            amount: string | null;
            /**
             * Indicator Id
             * Format: uuid
             */
            indicator_id: string;
            /**
             * Process Id
             * Format: uuid
             */
            process_id: string;
            status: components["schemas"]["ScoreStatus"];
            /** Warnings */
            warnings: components["schemas"]["Warning"][];
        };
        /** ScoreCellsRequest */
        ScoreCellsRequest: {
            /** Comparison Token */
            comparison_token: string;
            /** Indicator Ids */
            indicator_ids: string[];
            /** Process Ids */
            process_ids: string[];
            /** Revision Snapshot */
            revision_snapshot: components["schemas"]["RevisionRef"][];
        };
        /** ScoreRowsRequest */
        ScoreRowsRequest: {
            /** Cursor */
            cursor?: string | null;
            /**
             * Differences Only
             * @default false
             */
            differences_only: boolean;
            /** Indicator Ids */
            indicator_ids: string[];
            /**
             * Limit
             * @default 100
             */
            limit: number;
            /** Process Ids */
            process_ids: string[];
            /** Revision Snapshot */
            revision_snapshot: components["schemas"]["RevisionRef"][];
        };
        /**
         * ScoreStatus
         * @enum {string}
         */
        ScoreStatus: "valid" | "missing" | "unresolved_basis";
        /** SearchFields */
        SearchFields: {
            /**
             * Category
             * @default
             */
            category: string;
            /**
             * Geography
             * @default
             */
            geography: string;
            /**
             * Process Name
             * @default
             */
            process_name: string;
            /**
             * Reference Flow Name
             * @default
             */
            reference_flow_name: string;
            /**
             * Subcategory
             * @default
             */
            subcategory: string;
        };
        /** SearchNode */
        SearchNode: {
            /** Children */
            children?: components["schemas"]["SearchNode"][];
            /** Geography */
            geography?: string | null;
            /** Id */
            id: string;
            /**
             * Kind
             * @enum {string}
             */
            kind: "branch" | "process";
            /** Label */
            label: string;
            /** Matching Descendant Count */
            matching_descendant_count?: number | null;
            /** Path */
            path: string[];
            /**
             * Release Id
             * Format: uuid
             */
            release_id: string;
        };
        /** SearchRequest */
        SearchRequest: {
            /** Branch Path */
            branch_path?: string[] | null;
            /** Cursor */
            cursor?: string | null;
            fields?: components["schemas"]["SearchFields"];
            /**
             * Limit
             * @default 100
             */
            limit: number;
            /** Revision Snapshot */
            revision_snapshot: components["schemas"]["RevisionRef"][];
        };
        /** Warning */
        Warning: {
            /** Code */
            code: string;
            /** Message */
            message: string;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    flow_cells_api_v1_comparison_flows_cells_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["FlowCellsRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Cells_FlowCell_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Too Many Requests */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Service Unavailable */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    flow_rows_api_v1_comparison_flows_rows_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RowsRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ComparisonPage_FlowRow_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Too Many Requests */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Service Unavailable */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    score_cells_api_v1_comparison_scores_cells_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ScoreCellsRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Cells_ScoreCell_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Too Many Requests */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Service Unavailable */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    score_rows_api_v1_comparison_scores_rows_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ScoreRowsRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ComparisonPage_Indicator_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Too Many Requests */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Service Unavailable */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    health_api_v1_health_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Health"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Too Many Requests */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Service Unavailable */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    indicators_api_v1_indicators_tree_get: {
        parameters: {
            query?: {
                revision_snapshot?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["IndicatorTree"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Too Many Requests */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Service Unavailable */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    me_api_v1_me_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Identity"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Too Many Requests */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Service Unavailable */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    operational_metrics_api_v1_metrics_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: number;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Too Many Requests */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Service Unavailable */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    headers_api_v1_processes_headers_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["HeadersRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Page_Header_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Too Many Requests */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Service Unavailable */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    resolve_api_v1_processes_resolve_selection_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ResolveRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Page_str_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Too Many Requests */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Service Unavailable */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    search_api_v1_processes_search_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SearchRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Page_SearchNode_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Too Many Requests */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Service Unavailable */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    ready_api_v1_ready_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Health"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Too Many Requests */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Service Unavailable */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    releases_api_v1_releases_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Page_Release_"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Too Many Requests */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
            /** @description Service Unavailable */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
}
