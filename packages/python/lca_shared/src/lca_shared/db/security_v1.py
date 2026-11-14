"""Database-enforced publication immutability and read-only public projections."""

from sqlalchemy import Connection

from lca_shared.db.schema_v1 import metadata


def install_security(connection: Connection) -> None:
    connection.exec_driver_sql("""
    CREATE FUNCTION lca_assert_mutable(owner_id uuid) RETURNS void
    LANGUAGE plpgsql AS $$
    DECLARE frozen timestamptz;
    BEGIN
      SELECT published_at INTO frozen FROM release_revision WHERE id = owner_id FOR UPDATE;
      IF frozen IS NOT NULL THEN
        RAISE EXCEPTION 'published revision data is immutable' USING ERRCODE = '23514';
      END IF;
    END $$;
    CREATE FUNCTION lca_revision_owned_guard() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF TG_OP <> 'INSERT' THEN PERFORM lca_assert_mutable(OLD.revision_id); END IF;
      IF TG_OP <> 'DELETE' THEN PERFORM lca_assert_mutable(NEW.revision_id); END IF;
      IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
      RETURN NEW;
    END $$;
    CREATE FUNCTION lca_revision_guard() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF TG_OP = 'INSERT' THEN
        IF NEW.published_at IS NOT NULL OR NEW.status IN ('published','superseded') THEN
          RAISE EXCEPTION 'revisions must be created unpublished' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END IF;
      IF TG_OP = 'DELETE' THEN
        IF OLD.published_at IS NOT NULL THEN
          RAISE EXCEPTION 'published revisions cannot be deleted' USING ERRCODE = '23514';
        END IF;
        RETURN OLD;
      END IF;
      IF OLD.published_at IS NOT NULL AND
        ((to_jsonb(NEW) - 'status') IS DISTINCT FROM (to_jsonb(OLD) - 'status')
         OR NEW.status NOT IN ('published','superseded')) THEN
        RAISE EXCEPTION 'published revision metadata is immutable' USING ERRCODE = '23514';
      END IF;
      IF OLD.published_at IS NULL AND NEW.published_at IS NOT NULL THEN
        IF current_user NOT IN ('lca_publisher','lca_migrator') THEN
          RAISE EXCEPTION 'only publisher may freeze revisions' USING ERRCODE = '42501';
        END IF;
        -- Serialize freezing against concurrent changes of shared flow descriptions.
        PERFORM f.id FROM flow f JOIN process_flows pf ON pf.flow_id = f.id
          WHERE pf.revision_id = NEW.id ORDER BY f.id FOR UPDATE OF f;
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER immutable_revision BEFORE INSERT OR UPDATE OR DELETE ON release_revision
      FOR EACH ROW EXECUTE FUNCTION lca_revision_guard();
    CREATE FUNCTION lca_release_guard() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF EXISTS (SELECT 1 FROM release_revision WHERE database_release_id=OLD.id AND published_at IS NOT NULL) THEN
        RAISE EXCEPTION 'published release metadata is immutable' USING ERRCODE = '23514';
      END IF;
      IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER immutable_release BEFORE UPDATE OR DELETE ON database_release
      FOR EACH ROW EXECUTE FUNCTION lca_release_guard();
    CREATE FUNCTION lca_rule_guard() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF OLD.approved THEN
        RAISE EXCEPTION 'approved rules are immutable; create a new version' USING ERRCODE = '23514';
      END IF;
      IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER immutable_rule BEFORE UPDATE OR DELETE ON resolution_rule
      FOR EACH ROW EXECUTE FUNCTION lca_rule_guard();
    CREATE FUNCTION lca_flow_guard() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF EXISTS (SELECT 1 FROM process_flows pf JOIN release_revision r ON r.id=pf.revision_id
                 WHERE pf.flow_id=OLD.id AND r.published_at IS NOT NULL) THEN
        RAISE EXCEPTION 'published flow identities and descriptions are immutable' USING ERRCODE = '23514';
      END IF;
      IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER immutable_flow BEFORE UPDATE OR DELETE ON flow
      FOR EACH ROW EXECUTE FUNCTION lca_flow_guard();
    CREATE FUNCTION lca_publication_guard() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM release_revision r WHERE r.id=NEW.active_revision_id
        AND r.database_release_id=NEW.database_release_id AND r.published_at IS NOT NULL
        AND r.status IN ('published','superseded')) THEN
        RAISE EXCEPTION 'publication must select an immutable published revision' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER valid_publication BEFORE INSERT OR UPDATE ON release_publication
      FOR EACH ROW EXECUTE FUNCTION lca_publication_guard();
    CREATE FUNCTION lca_no_truncate() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'truncate is prohibited; use revision-scoped operations' USING ERRCODE = '23514';
    END $$;
    """)
    for table in metadata.sorted_tables:
        name = table.name
        if "revision_id" in table.c:
            connection.exec_driver_sql(
                f'CREATE TRIGGER immutable_revision_data BEFORE INSERT OR UPDATE OR DELETE ON "{name}" '
                "FOR EACH ROW EXECUTE FUNCTION lca_revision_owned_guard()"
            )
        connection.exec_driver_sql(
            f'CREATE TRIGGER no_truncate BEFORE TRUNCATE ON "{name}" '
            "EXECUTE FUNCTION lca_no_truncate()"
        )
    connection.exec_driver_sql("""
      CREATE SCHEMA api;
      REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
      REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
      GRANT USAGE ON SCHEMA public TO lca_import, lca_publisher;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO lca_import;
      REVOKE ALL ON release_publication, alembic_version FROM lca_import;
      GRANT SELECT ON ALL TABLES IN SCHEMA public TO lca_publisher;
      GRANT UPDATE ON release_revision TO lca_publisher;
      GRANT INSERT, UPDATE ON release_publication TO lca_publisher;
      GRANT EXECUTE ON FUNCTION lca_assert_mutable(uuid) TO lca_import, lca_publisher;
      GRANT USAGE ON SCHEMA api TO lca_api;
    """)
    views = {
        "database_release": "SELECT d.* FROM database_release d WHERE EXISTS (SELECT 1 FROM release_revision r WHERE r.database_release_id=d.id AND r.published_at IS NOT NULL)",
        "release_revision": "SELECT id,database_release_id,revision_no,status,published_at FROM release_revision WHERE published_at IS NOT NULL",
        "release_publication": "SELECT p.* FROM release_publication p JOIN release_revision r ON r.id=p.active_revision_id WHERE r.published_at IS NOT NULL",
        "flow": "SELECT f.* FROM flow f WHERE EXISTS (SELECT 1 FROM process_flows pf JOIN release_revision r ON r.id=pf.revision_id WHERE pf.flow_id=f.id AND r.published_at IS NOT NULL)",
    }
    for name in (
        "process",
        "process_flows",
        "impact_method",
        "impact_indicator",
        "lcia_score",
        "process_warning",
    ):
        views[name] = (
            f'SELECT t.* FROM "{name}" t JOIN release_revision r ON r.id=t.revision_id WHERE r.published_at IS NOT NULL'
        )
    # Warning linkage IDs are not needed by clients; views omit private audit pointers.
    views["process_warning"] = (
        "SELECT t.id,t.revision_id,t.process_id,t.flow_id,t.flow_type,t.indicator_id,t.code,t.message FROM process_warning t JOIN release_revision r ON r.id=t.revision_id WHERE r.published_at IS NOT NULL"
    )
    views["lcia_score"] = (
        "SELECT t.revision_id,t.process_id,t.indicator_id,t.amount,t.status FROM lcia_score t JOIN release_revision r ON r.id=t.revision_id WHERE r.published_at IS NOT NULL"
    )
    for name, query in views.items():
        connection.exec_driver_sql(
            f'CREATE VIEW api."{name}" WITH (security_barrier=true) AS {query}'
        )
    connection.exec_driver_sql("GRANT SELECT ON ALL TABLES IN SCHEMA api TO lca_api")
