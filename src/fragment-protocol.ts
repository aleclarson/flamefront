export const flamefrontFragmentQueryParam = "__flamefront_fragment"
export const flamefrontShellQueryParam = "__flamefront_shell"
export const flamefrontFragmentQueryValue = "1"

/** Remove framework-only query parameters before a URL reaches app code. */
export function stripFlamefrontProtocolParams(input: string | URL): URL {
  const url = new URL(input, "http://flamefront.local")

  url.searchParams.delete(flamefrontFragmentQueryParam)
  url.searchParams.delete(flamefrontShellQueryParam)
  return url
}

export function isRouteFragmentRequest(input: string | URL): boolean {
  const url = new URL(input, "http://flamefront.local")

  return (
    url.searchParams.get(flamefrontFragmentQueryParam) ===
    flamefrontFragmentQueryValue
  )
}

/** Mark a route URL for the fragment transport. */
export function withRouteFragmentProtocol(input: string | URL): URL {
  const url = stripFlamefrontProtocolParams(input)

  url.searchParams.set(
    flamefrontFragmentQueryParam,
    flamefrontFragmentQueryValue,
  )
  return url
}

/** Pass a request to a loader without leaking framework protocol parameters. */
export function stripFlamefrontProtocolRequest(request: Request): Request {
  const url = stripFlamefrontProtocolParams(request.url)

  return new Request(url, request)
}
