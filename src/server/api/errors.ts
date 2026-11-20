import "@tanstack/react-start/server-only"

/** A refused API request, answered with the consistent JSON error shape. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly field?: string,
    public readonly headers: Record<string, string> = {}
  ) {
    super(message)
    this.name = "ApiError"
  }
}

export const unauthorized = () =>
  new ApiError(
    401,
    "unauthorized",
    "Send a valid API Key as `Authorization: Bearer <API Key>`. The key may be wrong, expired or revoked, or its Service Account disabled.",
    undefined,
    { "www-authenticate": 'Bearer realm="Agent 6 API"' }
  )

export const notFound = (what = "record") =>
  new ApiError(
    404,
    "not_found",
    `No ${what} with this ID exists within this API Key's Application scope.`
  )

/** JSON with headers that keep the answer out of caches and sniffing. */
export function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...headers,
    },
  })
}

export function errorResponse(error: ApiError): Response {
  return jsonResponse(
    error.status,
    {
      error: {
        code: error.code,
        message: error.message,
        ...(error.field ? { field: error.field } : {}),
      },
    },
    error.headers
  )
}
