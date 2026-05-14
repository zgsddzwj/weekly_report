"""S3-compatible object storage for large Markdown bodies (architecture §3.3 / §9 V1)."""

from __future__ import annotations

import io
from typing import Any

import boto3
from botocore.config import Config

from app.config import get_settings


def s3_client() -> Any:
    s = get_settings()
    if not s.s3_endpoint_url or not s.s3_access_key_id or not s.s3_secret_access_key:
        raise RuntimeError("S3 is not configured")
    return boto3.client(
        "s3",
        endpoint_url=s.s3_endpoint_url,
        aws_access_key_id=s.s3_access_key_id,
        aws_secret_access_key=s.s3_secret_access_key,
        region_name=s.s3_region,
        config=Config(s3={"addressing_style": "path" if s.s3_use_path_style else "virtual"}),
    )


def upload_report_markdown(*, run_id: int, markdown: str) -> tuple[str, str]:
    """Returns (bucket, object_key)."""
    s = get_settings()
    if not s.s3_bucket:
        raise RuntimeError("S3 bucket not configured")
    key = f"report-runs/{run_id}.md"
    body = markdown.encode("utf-8")
    s3_client().put_object(
        Bucket=s.s3_bucket,
        Key=key,
        Body=io.BytesIO(body),
        ContentType="text/markdown; charset=utf-8",
    )
    return s.s3_bucket, key


def download_report_markdown(*, bucket: str, key: str) -> str:
    buf = io.BytesIO()
    s3_client().download_fileobj(bucket, key, buf)
    return buf.getvalue().decode("utf-8")
