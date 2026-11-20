/** A JSON value, as the OpenAPI document holds only JSON. */
export type Json =
  string | number | boolean | null | Array<Json> | { [key: string]: Json }

/** The parts of the API's OpenAPI 3.1 document the reference page reads. */
export type OpenApiDocument = {
  openapi: string
  info: { title: string; version: string; description: string }
  servers: Array<{ url: string }>
  tags: Array<{ name: string }>
  paths: Record<string, Record<string, Json>>
  components: Record<string, Json>
}
