import { Code, DocTable, InlineText } from "./docs-shell"

/*
 * Field tables generated from JSON Schema, for request bodies, responses and
 * webhook payloads. Nested objects become dotted paths, arrays `[]`, nullable
 * values "or null", and discriminated unions one row per variant field with
 * the variant it belongs to.
 */

export type JsonSchema = {
  type?: string | Array<string>
  properties?: Record<string, JsonSchema>
  required?: Array<string>
  items?: JsonSchema
  anyOf?: Array<JsonSchema>
  oneOf?: Array<JsonSchema>
  enum?: Array<unknown>
  const?: unknown
  format?: string
  description?: string
  default?: unknown
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  minItems?: number
  maxItems?: number
  additionalProperties?: boolean | JsonSchema
}

export type FieldRow = {
  name: string
  type: string
  required: boolean
  description?: string
  notes: Array<string>
}

const isNull = (schema: JsonSchema) =>
  schema.type === "null" || (schema.const === null && !schema.type)

/** The schema without its "or null", and whether null is allowed. */
export function unwrapNullable(schema: JsonSchema): {
  schema: JsonSchema
  nullable: boolean
} {
  const variants = schema.anyOf ?? schema.oneOf
  if (variants?.some(isNull)) {
    const rest = variants.filter((item) => !isNull(item))
    const inner: JsonSchema =
      rest.length === 1
        ? { ...rest[0], description: schema.description ?? rest[0].description }
        : { description: schema.description, oneOf: rest }
    return { schema: inner, nullable: true }
  }
  if (Array.isArray(schema.type) && schema.type.includes("null")) {
    const types = schema.type.filter((item) => item !== "null")
    return {
      schema: { ...schema, type: types.length === 1 ? types[0] : types },
      nullable: true,
    }
  }
  return { schema, nullable: false }
}

/** The object variants of a union, when every variant is an object. */
function objectVariants(schema: JsonSchema): Array<JsonSchema> | undefined {
  const variants = schema.oneOf ?? schema.anyOf
  return variants?.length && variants.every((item) => item.properties)
    ? variants
    : undefined
}

/** The property every variant fixes to a constant, such as `type` or `kind`. */
function discriminator(variants: Array<JsonSchema>): string | undefined {
  const first = Object.keys(variants[0].properties ?? {})
  return first.find((key) =>
    variants.every((item) => item.properties?.[key]?.const !== undefined)
  )
}

const literal = (value: unknown) => JSON.stringify(value)

export function typeLabel(input: JsonSchema): string {
  const { schema, nullable } = unwrapNullable(input)
  let label: string
  if (schema.const !== undefined) label = literal(schema.const)
  else if (schema.enum) label = schema.enum.map(literal).join(" | ")
  else if (objectVariants(schema)) label = "object, one of the variants below"
  else if (schema.oneOf ?? schema.anyOf)
    label = (schema.oneOf ?? schema.anyOf)!.map(typeLabel).join(" | ")
  else if (schema.type === "array") {
    const item = schema.items ? unwrapNullable(schema.items).schema : undefined
    label = item?.properties
      ? "array of objects"
      : `array of ${item ? typeLabel(item) : "values"}`
  } else if (schema.type === "string" && schema.format === "date-time")
    label = "string (ISO 8601 time)"
  else if (schema.type === "string" && schema.format === "uri")
    label = "string (URL)"
  else if (Array.isArray(schema.type)) label = schema.type.join(" | ")
  else label = schema.type ?? (schema.properties ? "object" : "any")
  return nullable ? `${label} or null` : label
}

/** Bounds a reader would act on; the integer type's own limits are not. */
const bounded = (value: number | undefined) =>
  value !== undefined && Math.abs(value) < Number.MAX_SAFE_INTEGER

export function constraints(input: JsonSchema): Array<string> {
  const { schema: raw } = unwrapNullable(input)
  const schema = {
    ...raw,
    minimum: bounded(raw.minimum) ? raw.minimum : undefined,
    maximum: bounded(raw.maximum) ? raw.maximum : undefined,
  }
  const notes: Array<string> = []
  if (schema.minLength !== undefined && schema.maxLength !== undefined)
    notes.push(`${schema.minLength}–${schema.maxLength} characters.`)
  else if (schema.maxLength !== undefined)
    notes.push(`At most ${schema.maxLength} characters.`)
  else if (schema.minLength)
    notes.push(
      `At least ${schema.minLength} character${schema.minLength === 1 ? "" : "s"}.`
    )
  if (schema.minimum !== undefined && schema.maximum !== undefined)
    notes.push(`From ${schema.minimum} to ${schema.maximum}.`)
  else if (schema.maximum !== undefined)
    notes.push(`At most ${schema.maximum}.`)
  else if (schema.minimum !== undefined)
    notes.push(`At least ${schema.minimum}.`)
  if (schema.maxItems !== undefined)
    notes.push(`Up to ${schema.maxItems} items.`)
  if (schema.items) {
    const item = unwrapNullable(schema.items).schema
    if (item.maxLength !== undefined)
      notes.push(`Each at most ${item.maxLength} characters.`)
  }
  if (schema.default !== undefined)
    notes.push(`Default ${literal(schema.default)}.`)
  return notes
}

const join = (prefix: string, key: string) =>
  prefix ? `${prefix}.${key}` : key

/** Every field of an object schema, nested fields included, in order. */
export function fieldRows(input: JsonSchema, prefix = ""): Array<FieldRow> {
  const { schema } = unwrapNullable(input)
  const variants = objectVariants(schema)
  if (variants) return variantRows(variants, prefix)
  if (schema.type === "array" && schema.items)
    return fieldRows(schema.items, `${prefix}[]`)
  const rows: Array<FieldRow> = []
  for (const [key, child] of Object.entries(schema.properties ?? {})) {
    const name = join(prefix, key)
    rows.push({
      name,
      type: typeLabel(child),
      required: schema.required?.includes(key) ?? false,
      description:
        child.description ?? unwrapNullable(child).schema.description,
      notes: constraints(child),
    })
    const inner = unwrapNullable(child).schema
    if (inner.properties || objectVariants(inner))
      rows.push(...fieldRows(inner, name))
    else if (inner.type === "array" && inner.items) {
      const item = unwrapNullable(inner.items).schema
      if (item.properties || objectVariants(item))
        rows.push(...fieldRows(item, `${name}[]`))
    }
  }
  return rows
}

function variantRows(variants: Array<JsonSchema>, prefix: string) {
  const key = discriminator(variants)
  const tag = (variant: JsonSchema, index: number) =>
    key ? literal(variant.properties![key].const) : String(index + 1)
  const rows: Array<FieldRow> = []
  if (key)
    rows.push({
      name: join(prefix, key),
      type: variants
        .map((item) => literal(item.properties![key].const))
        .join(" | "),
      required: true,
      description: "Which variant this is.",
      notes: [],
    })
  // A field several variants share is listed once, naming those variants.
  const merged = new Map<string, { row: FieldRow; tags: Array<string> }>()
  variants.forEach((variant, index) => {
    const own = fieldRows(
      {
        ...variant,
        properties: Object.fromEntries(
          Object.entries(variant.properties ?? {}).filter(
            ([name]) => name !== key
          )
        ),
      },
      prefix
    )
    for (const row of own) {
      const id = `${row.name}:${row.type}`
      const found = merged.get(id)
      if (found) found.tags.push(tag(variant, index))
      else merged.set(id, { row, tags: [tag(variant, index)] })
    }
  })
  for (const { row, tags } of merged.values()) {
    const when =
      tags.length === variants.length
        ? []
        : [
            key
              ? `When ${key} is ${tags.join(" or ")}.`
              : `In variant ${tags.join(" or ")}.`,
          ]
    rows.push({ ...row, notes: [...when, ...row.notes] })
  }
  return rows
}

/**
 * A field table. In a request, fields are marked required or optional; in a
 * response or payload, fields that may be left out are marked so.
 */
export function SchemaFields({
  schema,
  caption,
  mode,
}: {
  schema: JsonSchema
  caption: string
  mode: "request" | "response"
}) {
  const rows = fieldRows(schema)
  if (!rows.length)
    return <p className="text-xs text-muted-foreground">No fields.</p>
  return (
    <DocTable caption={caption} head={["Field", "Type", "Description"]}>
      {rows.map((row, index) => (
        <tr key={`${index}:${row.name}`}>
          <td className="w-[1%] whitespace-nowrap">
            <Code>{row.name}</Code>
            {mode === "request" ? (
              <span className="mt-0.5 block text-muted-foreground">
                {row.required ? "required" : "optional"}
              </span>
            ) : (
              !row.required && (
                <span className="mt-0.5 block text-muted-foreground">
                  may be left out
                </span>
              )
            )}
          </td>
          <td className="font-mono">{row.type}</td>
          <td>
            {row.description && (
              <span className="block">
                <InlineText text={row.description} />
              </span>
            )}
            {row.notes.length > 0 && (
              <span className="block text-muted-foreground">
                {row.notes.join(" ")}
              </span>
            )}
          </td>
        </tr>
      ))}
    </DocTable>
  )
}
