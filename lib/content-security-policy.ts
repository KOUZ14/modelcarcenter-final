export function contentSecurityPolicy(nonce: string, production: boolean) {
  const scripts = production ? `'nonce-${nonce}' 'strict-dynamic'` : "'self' 'unsafe-inline' 'unsafe-eval'";
  return [
    "default-src 'self'", "base-uri 'none'",
    `connect-src 'self'${production ? "" : " ws: wss:"}`,
    "font-src 'self' data:", "form-action 'self' https://checkout.stripe.com",
    "frame-ancestors 'none'", "frame-src 'none'", "img-src 'self' data: blob: https:",
    "object-src 'none'", `script-src ${scripts}`, "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'", ...(production ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

export function requestWithScriptNonce(request: Request, production: boolean) {
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24))));
  const policy = contentSecurityPolicy(nonce, production);
  const headers = new Headers(request.headers);
  // Never allow a caller to select the renderer's nonce or policy.
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", policy);
  headers.delete("content-security-policy-report-only");
  return { request: new Request(request, { headers }), policy };
}
