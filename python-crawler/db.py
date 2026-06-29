"""
db.py — Direct async Supabase REST + Storage API calls via httpx.
Bypasses supabase-py entirely for DB operations so auth headers are always
set correctly and we never block the asyncio event loop.

Connection-pooled httpx client (singleton) — keeps TCP connections alive
across calls, reducing latency on every DB operation.
"""

import os
import httpx
from typing import Any

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SERVICE_KEY  = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

_REST    = f"{SUPABASE_URL}/rest/v1"
_STORAGE = f"{SUPABASE_URL}/storage/v1"

# ── Shared connection-pooled httpx client ──────────────────────────────────

_db_client: httpx.AsyncClient | None = None


def _client() -> httpx.AsyncClient:
    """Lazy singleton — connection-pooled httpx client reused across calls."""
    global _db_client
    if _db_client is None or _db_client.is_closed:
        _db_client = httpx.AsyncClient(
            timeout=30.0,
            limits=httpx.Limits(max_connections=30, max_keepalive_connections=15),
        )
    return _db_client


async def close_db_client():
    global _db_client
    if _db_client and not _db_client.is_closed:
        await _db_client.aclose()
        _db_client = None


# ── Headers ────────────────────────────────────────────────────────────────

def _db_headers(prefer: str = "return=representation") -> dict:
    return {
        "apikey":        SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type":  "application/json",
        "Prefer":        prefer,
    }

def _storage_headers(content_type: str = "application/octet-stream") -> dict:
    return {
        "apikey":        SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type":  content_type,
    }

# ── DB helpers ─────────────────────────────────────────────────────────────

async def db_select(
    table: str,
    select: str = "*",
    filters: dict[str, str] | None = None,
    order: str | None = None,
    limit: int | None = None,
) -> list[dict]:
    """SELECT rows. filters dict values must already be PostgREST operators."""
    headers = {
        "apikey":        SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
    }
    params: dict[str, Any] = {"select": select}
    if filters:
        params.update(filters)
    if order:
        params["order"] = order
    if limit:
        params["limit"] = limit
    r = await _client().get(f"{_REST}/{table}", headers=headers, params=params)
    if not r.is_success:
        print(f"[DB] SELECT {table} failed {r.status_code}: {r.text[:300]}")
        r.raise_for_status()
    return r.json()


async def db_insert(table: str, data: dict | list) -> list[dict]:
    """INSERT one row (dict) or many rows (list of dicts). Returns inserted rows."""
    r = await _client().post(f"{_REST}/{table}", headers=_db_headers(), json=data)
    r.raise_for_status()
    result = r.json()
    return result if isinstance(result, list) else [result]


async def db_update(table: str, data: dict, filters: dict[str, str]) -> list[dict]:
    """UPDATE rows matching filters. Returns updated rows."""
    r = await _client().patch(
        f"{_REST}/{table}",
        headers=_db_headers(),
        params=dict(filters),
        json=data,
    )
    r.raise_for_status()
    result = r.json()
    return result if isinstance(result, list) else [result]


# ── Storage helpers ────────────────────────────────────────────────────────

async def storage_upload(
    bucket: str,
    path: str,
    content: bytes,
    content_type: str = "text/html",
    upsert: bool = False,
) -> dict:
    """Upload a file to Supabase Storage."""
    url = f"{_STORAGE}/object/{bucket}/{path}"
    headers = {
        **_storage_headers(content_type),
        "x-upsert": "true" if upsert else "false",
    }
    r = await _client().post(url, headers=headers, content=content, timeout=60)
    r.raise_for_status()
    return r.json()


async def storage_download(bucket: str, path: str) -> bytes:
    """Download a file from Supabase Storage. Returns raw bytes."""
    url = f"{_STORAGE}/object/{bucket}/{path}"
    r = await _client().get(url, headers=_storage_headers(), timeout=60)
    r.raise_for_status()
    return r.content
