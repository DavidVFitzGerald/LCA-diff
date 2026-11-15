"""Portable spark-submit entry point; no Airflow dependency in extraction logic."""

from lca_etl.spark import main

if __name__ == "__main__":
    main()
