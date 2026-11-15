import { createFileRoute } from "@tanstack/react-router"
import { AuthorizationError } from "@/server/session"
import { UploadError, createUploads } from "@/server/uploads"
import { IMAGE_TOO_LARGE, MAX_IMAGE_BYTES } from "@/lib/chat"

export const Route = createFileRoute("/api/uploads/")({
  server: {
    handlers: {
      /** One picture as multipart field `file`. Answers with its `ChatImage`. */
      POST: async ({ request }) => {
        // Cookie-authenticated mutation: accept only the same browser origin.
        if (request.headers.get("origin") !== new URL(request.url).origin)
          return new Response("This request is not allowed.", { status: 403 })
        try {
          // Refuse an oversize body before reading it; the form adds a little.
          if (
            Number(request.headers.get("content-length")) >
            MAX_IMAGE_BYTES + 64_000
          )
            return new Response(IMAGE_TOO_LARGE, { status: 413 })
          const file = (await request.formData()).get("file")
          if (!(file instanceof File))
            return new Response("Choose a picture to add.", { status: 400 })
          if (file.size > MAX_IMAGE_BYTES)
            return new Response(IMAGE_TOO_LARGE, { status: 413 })
          return Response.json(
            await createUploads().add(request.headers, {
              name: file.name,
              bytes: new Uint8Array(await file.arrayBuffer()),
            }),
            { status: 201 }
          )
        } catch (error) {
          if (error instanceof AuthorizationError)
            return new Response("Please sign in again.", { status: 401 })
          if (error instanceof UploadError)
            return new Response(error.message, { status: error.status })
          return new Response(
            "The picture could not be added. Please try again.",
            { status: 400 }
          )
        }
      },
    },
  },
})
