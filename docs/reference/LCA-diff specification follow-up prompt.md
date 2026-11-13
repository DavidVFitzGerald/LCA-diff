I have read parts of the implementation specification. Here are a few modifications I would like you to make:

The following tools/packages should be used for the parts written in Python, where it makes sense to use: use uv as package and Python environment manager, ruff for code formatting (use commonly used set of rules), implement type checking with MyPy, use Pydantic for data validation, implement logging with loguru, and python-dotenv for managing environment variables.

Unit tests, integration test, and end-to-end tests need to be setup for the MVP.

Regarding the data model (section 4):
- In database_release table, change release_label to release_version.
- Explain the purpose of the tables release_revision, release_publication, stg_reference_resolution. Also the revision_id.
 -The staging tables should have BAFU in their names, as there will need to be a different set of tables for each type of database. Multiple versions of BAFU databases (e.g. BAFU:2026 v1, BAFU:2026 v2, BAFU:2027, etc) can be stored in the same set of tables, if you agree that this is a sensible thing to do?
-In the set of tables containing the harmonized data, I want the following changes:
    - harmonized_flow should be named just "flow". No need for the source_flow_identity table, as it is not needed to know which original data was the reason for the flow to be generated. The information in the exchange_provenance is enough.
    - harmonized_process should be named just "process". Since I'm not sure what the revision_id is, I was thinking that the process table should rather have the id from the database_release table in order to identify the database the process is from.
    - The "harmonized_exchange" table should be renamed to "process_flows".
    - Rename "process_score" to "LCIA_score", as we might need "process_score" in the future for another type of score.

In the original description, I mentioned that the user should first see a landing page. To keep the app simple, let's not have a dedicated landing page. Instead, the user should see directly the interface, but with a login pop up window in the center of the screen and the background greyed out. If the user recently logged in, they should not need to log in again. Follow common practices for web interfaces that require a log in.

How should we manage the .md files that I provided, and those that you provided? Also, later on, future decisions and implementation might deviate from the implementation specification; how to make sure that the future decisions take precedence over the implementation specification while keeping the specification document in the repository?

Ask up to 10 questions to clarify any of these points and resolve potential conflicts with the current version of the specification. Then provide an updated version of the PRD (if modifications are needed) and the implementation specification.