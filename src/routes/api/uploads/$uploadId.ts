import { createFileRoute } from "@tanstack/react-router"
import { AuthorizationError } from "@/server/session"
import { UploadError, createUploads } from "@/server/uploads"

function failure(error: unknown) {
  if (error instanceof AuthorizationError)
    return new Response("Please sign in again.", { status: 401 })
  if (error instanceof UploadError)
    return new Response(error.message, { status: error.status })
  return new Response("This picture is not available.", { status: 404 })
}

export const Route = createFileRoute("/api/uploads/$uploadId")({
  server: {
    handlers: {
      /** The picture itself, for whoever may open its Conversation. */
      GET: async ({ request, params }) => {
        try {
          const image = await createUploads().read(
            request.headers,
            params.uploadId
          )
          return new Response(new Uint8Array(image.bytes), {
            headers: {
              "Content-Type": image.type,
              "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(image.name)}`,
              // The id never gets other content; never store it in shared caches.
              "Cache-Control": "private, max-age=31536000, immutable",
              "X-Content-Type-Options": "nosniff",
              "Content-Security-Policy": "default-src 'none'",
            },
          })
        } catch (error) {
          return failure(error)
        }
      },
      /** Drops a picked picture that was removed before sending. */
      DELETE: async ({ request, params }) => {
        if (request.headers.get("origin") !== new URL(request.url).origin)
          return new Response("This request is not allowed.", { status: 403 })
        try {
          await createUploads().discard(request.headers, params.uploadId)
          return new Response(null, { status: 204 })
        } catch (error) {
          return failure(error)
        }
      },
    },
  },
})
