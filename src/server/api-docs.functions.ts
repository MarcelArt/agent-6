import { createServerFn } from "@tanstack/react-start"
import { getConfig } from "./config"
import { buildOpenApiDocument } from "./api/openapi"
import { API_ROUTES } from "./api/routes"
import type { OpenApiDocument } from "@/lib/openapi"

/**
 * The OpenAPI document for the public reference page. Public on purpose: it
 * holds no data, only the API's shape. The same document is served at
 * /api/v1/openapi.json.
 */
export const getApiReference = createServerFn({ method: "GET" }).handler(
  (): OpenApiDocument =>
    // Plain JSON throughout; the generator's types are just looser.
    buildOpenApiDocument(API_ROUTES, {
      baseUrl: getConfig().baseUrl,
    }) as unknown as OpenApiDocument
)
