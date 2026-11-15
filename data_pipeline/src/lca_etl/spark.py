"""Bounded Spark extraction used by the portable spark-submit entry point."""

import argparse
import json
from pathlib import Path
from typing import Any

from lca_etl.xml import parse_xml


def extract(
    input_paths: list[str], output: Path, *, max_bytes: int, master: str = "local[2]"
) -> None:
    from pyspark.sql import SparkSession

    spark = (
        SparkSession.builder.master(master)
        .appName("lca-bafu-extract")
        .config("spark.ui.enabled", "false")
        .config("spark.driver.memory", "768m")
        .config("spark.jars.ivy", "/tmp/lca-spark-ivy")
        .config("spark.sql.shuffle.partitions", "2")
        .getOrCreate()
    )
    spark.sparkContext.setLogLevel("ERROR")
    try:
        # Paths are a bounded inventory of names, not the input corpus contents.
        # Each Spark partition opens one bounded binary file at a time.
        source = spark.sparkContext.parallelize(input_paths, min(2, len(input_paths)))

        def convert(path: str) -> str:
            import hashlib

            digest = hashlib.sha256()
            size = 0
            content = bytearray()
            with Path(path).open("rb") as stream:
                for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                    digest.update(chunk)
                    size += len(chunk)
                    if size <= max_bytes:
                        content.extend(chunk)
            result: dict[str, Any] = (
                parse_xml(bytes(content), max_bytes=max_bytes)
                if size <= max_bytes
                else {"processes": [], "error": "XML_SIZE_BUDGET"}
            )
            result.update({"path": path, "sha256": digest.hexdigest(), "byte_size": size})
            return json.dumps(result, ensure_ascii=False)

        source.map(convert).saveAsTextFile(str(output))
    finally:
        spark.stop()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--inventory", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--max-bytes", required=True, type=int)
    args = parser.parse_args()
    extract(json.loads(args.inventory.read_bytes()), args.output, max_bytes=args.max_bytes)


if __name__ == "__main__":
    main()
