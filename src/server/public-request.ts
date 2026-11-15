import "@tanstack/react-start/server-only"

/** Use a configured public origin without trusting forwarded headers or changing browser Origin. */
export function publicRequest(request: Request, baseUrl: string): Request {
  const publicUrl = new URL(baseUrl)
  const url = new URL(request.url)
  url.protocol = publicUrl.protocol
  url.hostname = publicUrl.hostname
  url.port = publicUrl.port
  return new Request(url, request)
}
