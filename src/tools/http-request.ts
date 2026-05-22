type HttpAllowRule = {
  host: string;
  method: string;
  path: string;
};

export type HttpRequestPolicy = {
  allow: HttpAllowRule[];
};

export type HttpRequestInput = {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

function normalizeMethod(method: string | undefined): string {
  return (method ?? "GET").trim().toUpperCase();
}

function isAllowedRequest(input: HttpRequestInput, policy: HttpRequestPolicy): boolean {
  const method = normalizeMethod(input.method);
  const url = new URL(input.url);
  return policy.allow.some((rule) => {
    if (rule.host.trim().toLowerCase() !== url.hostname.toLowerCase()) {
      return false;
    }
    if (rule.method.trim().toUpperCase() !== method) {
      return false;
    }
    return url.pathname.startsWith(rule.path);
  });
}

export async function executeHttpRequestTool(
  input: HttpRequestInput,
  policy: HttpRequestPolicy,
  fetchFn: typeof fetch = fetch,
): Promise<{ status: number; body: string }> {
  if (!isAllowedRequest(input, policy)) {
    throw new Error("http.request denied by policy");
  }
  const response = await fetchFn(input.url, {
    method: normalizeMethod(input.method),
    headers: input.headers,
    body: input.body,
  });
  return {
    status: response.status,
    body: await response.text(),
  };
}
