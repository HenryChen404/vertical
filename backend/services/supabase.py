from __future__ import annotations

import os
from functools import lru_cache

from supabase import create_client, Client


@lru_cache()
def get_supabase() -> Client:
    url = os.getenv("SUPABASE_URL", "http://127.0.0.1:54331")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    return create_client(url, key)
