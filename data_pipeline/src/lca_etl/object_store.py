"""Immutable content-addressed archive transfer; no bucket provisioning."""

import hashlib
import os
import shutil
import tempfile
from contextlib import suppress
from pathlib import Path, PurePosixPath
from typing import Any
from urllib.parse import unquote, urlparse

from lca_etl.intake import sha256
from lca_etl.publication_models import OperationError


def safe_relative(value: str) -> str:
    path = PurePosixPath(value)
    if (
        not value
        or "\\" in value
        or ":" in value
        or path.is_absolute()
        or ".." in path.parts
        or str(path) != value
    ):
        raise OperationError("ARCHIVE_PATH_INVALID")
    return value


class ObjectStore:
    def __init__(self, uri: str, *, require_private: bool = False) -> None:
        parsed = urlparse(uri)
        self.uri = uri.rstrip("/")
        self.root = Path(unquote(parsed.path)) if parsed.scheme == "file" else None
        self.bucket: Any = None
        self.prefix = parsed.path.strip("/") if parsed.scheme == "gs" else ""
        if parsed.scheme == "gs":
            # The Google namespace omits py.typed; isolate the untyped SDK boundary.
            from google.cloud import storage  # type: ignore[import-untyped]

            self.bucket = storage.Client().get_bucket(parsed.netloc)
            if (
                require_private
                and self.bucket.iam_configuration.public_access_prevention != "enforced"
            ):
                raise OperationError("PRIVATE_BUCKET_PREVENTION_REQUIRED")
        elif parsed.scheme != "file":
            raise OperationError("ARCHIVE_SCHEME_INVALID")

    def location(self, relative: str) -> str:
        relative = safe_relative(relative)
        if self.root is not None:
            return self.local_path(relative).as_uri()
        return self.uri + "/" + relative

    def local_path(self, relative: str) -> Path:
        assert self.root is not None
        path = self.root / safe_relative(relative)
        if path.is_symlink() or not path.resolve().is_relative_to(self.root.resolve()):
            raise OperationError("ARCHIVE_PATH_INVALID")
        return path

    def verify(self, relative: str, digest: str, size: int) -> None:
        safe_relative(relative)
        if self.root is not None:
            path = self.local_path(relative)
            if not path.is_file() or path.stat().st_size != size or sha256(path) != digest:
                raise OperationError("ARCHIVE_CHECKSUM_MISMATCH")
            return
        blob = self.bucket.blob("/".join(filter(None, (self.prefix, relative))))
        # Download to a private temporary file, not an unbounded in-memory value.
        with tempfile.TemporaryFile() as stream:
            blob.download_to_file(stream, checksum="auto", timeout=60)
            if stream.tell() != size:
                raise OperationError("ARCHIVE_CHECKSUM_MISMATCH")
            stream.seek(0)
            result = hashlib.sha256()
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                result.update(chunk)
            if result.hexdigest() != digest:
                raise OperationError("ARCHIVE_CHECKSUM_MISMATCH")

    def put(self, source: Path, relative: str, digest: str, size: int) -> str:
        relative = safe_relative(relative)
        if source.stat().st_size != size or sha256(source) != digest:
            raise OperationError("SOURCE_CHECKSUM_MISMATCH")
        if self.root is not None:
            self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
            target = self.local_path(relative)
            target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            if not target.exists():
                descriptor, temporary = tempfile.mkstemp(dir=target.parent)
                staging = Path(temporary)
                try:
                    with os.fdopen(descriptor, "wb") as stream, source.open("rb") as reader:
                        shutil.copyfileobj(reader, stream)
                    if staging.stat().st_size != size or sha256(staging) != digest:
                        raise OperationError("SOURCE_CHANGED_DURING_TRANSFER")
                    # Link is atomic and never overwrites an existing object.
                    with suppress(FileExistsError):
                        os.link(staging, target)
                finally:
                    staging.unlink(missing_ok=True)
            self.verify(relative, digest, size)
        else:
            from google.api_core.exceptions import PreconditionFailed

            blob = self.bucket.blob("/".join(filter(None, (self.prefix, relative))))
            with suppress(PreconditionFailed):
                blob.upload_from_filename(
                    str(source), if_generation_match=0, checksum="crc32c", timeout=60
                )
            self.verify(relative, digest, size)
        return self.location(relative)
