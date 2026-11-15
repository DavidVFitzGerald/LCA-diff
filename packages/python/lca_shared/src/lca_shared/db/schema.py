"""Current schema, copied from the frozen initial migration definition.

Future changes belong here and in a new Alembic revision, never in schema_v1.
"""

from sqlalchemy import MetaData

from lca_shared.db import schema_v1

metadata = MetaData(naming_convention=schema_v1.metadata.naming_convention)
for _table in schema_v1.metadata.sorted_tables:
    _table.to_metadata(metadata)

database_release = metadata.tables["database_release"]
release_revision = metadata.tables["release_revision"]
release_publication = metadata.tables["release_publication"]
import_run = metadata.tables["import_run"]
source_object = metadata.tables["source_object"]
validation_issue = metadata.tables["validation_issue"]
resolution_rule = metadata.tables["resolution_rule"]
stg_bafu_process = metadata.tables["stg_bafu_process"]
stg_bafu_exchange = metadata.tables["stg_bafu_exchange"]
stg_bafu_lcia_row = metadata.tables["stg_bafu_lcia_row"]
stg_bafu_lcia_column = metadata.tables["stg_bafu_lcia_column"]
stg_bafu_reference_resolution = metadata.tables["stg_bafu_reference_resolution"]
flow = metadata.tables["flow"]
process = metadata.tables["process"]
process_flows = metadata.tables["process_flows"]
flow_provenance = metadata.tables["flow_provenance"]
impact_method = metadata.tables["impact_method"]
impact_indicator = metadata.tables["impact_indicator"]
lcia_score = metadata.tables["lcia_score"]
process_warning = metadata.tables["process_warning"]
