-- Disposable local credentials only. Production roles/secrets are provisioned in R1.
CREATE ROLE lca_migrator LOGIN PASSWORD 'local-migration-only' NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE ROLE lca_import LOGIN PASSWORD 'local-import-only' NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE ROLE lca_publisher LOGIN PASSWORD 'local-publisher-only' NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE ROLE lca_api LOGIN PASSWORD 'local-read-only' NOSUPERUSER NOCREATEDB NOCREATEROLE;
ALTER DATABASE lca OWNER TO lca_migrator;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO lca_migrator;
GRANT CONNECT ON DATABASE lca TO lca_import, lca_publisher, lca_api;
ALTER ROLE lca_api SET default_transaction_read_only = on;
ALTER ROLE lca_api SET statement_timeout = '10s';
ALTER ROLE lca_api SET idle_in_transaction_session_timeout = '10s';
