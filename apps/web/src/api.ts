const prefix = import.meta.env.VITE_API_BASE ?? "/api/v1";

export function getToken(): string | null {
  return localStorage.getItem("wr_token");
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem("wr_token", token);
  else localStorage.removeItem("wr_token");
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const tok = getToken();
  if (tok) headers.set("Authorization", `Bearer ${tok}`);
  const res = await fetch(`${prefix}${path}`, { ...options, headers });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = (await res.json()) as { detail?: unknown };
      if (typeof j.detail === "string") detail = j.detail;
      else if (Array.isArray(j.detail)) detail = JSON.stringify(j.detail);
      else if (j.detail) detail = JSON.stringify(j.detail);
    } catch {
      try {
        detail = await res.text();
      } catch {
        /* ignore */
      }
    }
    throw new Error(detail || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function* sseLines(path: string): AsyncGenerator<string, void, unknown> {
  const tok = getToken();
  const res = await fetch(`${prefix}${path}`, {
    headers: { Authorization: tok ? `Bearer ${tok}` : "", Accept: "text/event-stream" },
  });
  if (!res.ok || !res.body) {
    throw new Error(`SSE failed: ${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (line.startsWith("data: ")) yield line.slice(6);
      }
    }
  } finally {
    reader.cancel();
  }
}
