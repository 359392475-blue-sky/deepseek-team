/** Address validation for the isolated Team listener and outbound member connections. */

import { isIP } from 'node:net'

function privateIpv4(hostname: string): boolean {
  if (isIP(hostname) !== 4) return false
  const [first, second] = hostname.split('.').map(Number)
  return first === 127 || first === 10
    || (first === 172 && second !== undefined && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
}

function privateAddress(hostname: string): boolean {
  if (privateIpv4(hostname)) return true
  const ipv6 = hostname.replace(/^\[|\]$/g, '')
  return isIP(ipv6) === 6 && (ipv6 === '::1' || /^(?:fc|fd)[0-9a-f]{2}:/i.test(ipv6))
}

/**
 * Normalize an explicit Team server base URL without credentials or redirect state.
 * @param input - server address entered by the local operator, optionally with a reverse-proxy prefix.
 * @returns canonical HTTPS address, or HTTP address with a private literal host.
 * @throws Error for credentials, query, fragment, ambiguous path segments, or public HTTP hosts.
 */
export function normalizeTeamServerUrl(input: string): string {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    // URL parsing is the only operation in this try; do not reflect a potentially secret input.
    throw new Error('Team server address must be an HTTP or HTTPS origin')
  }
  const raw = /^https?:\/\/[^\\/?#]+(\/[^?#]*)?$/i.exec(input.trim())
  const path = raw?.[1] ?? ''
  if ((url.protocol !== 'http:' && url.protocol !== 'https:')
    || url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== ''
    || raw === null || url.hostname === '' || !/^[A-Za-z0-9._~/-]*$/.test(path)
    || path.includes('//') || path.split('/').some(segment => segment === '.' || segment === '..')) {
    throw new Error('Team server address cannot contain credentials, query, fragment, or ambiguous paths')
  }
  if (url.protocol === 'http:' && !privateAddress(url.hostname)) {
    throw new Error('HTTP Team servers require a private IP address; use HTTPS for other hosts')
  }
  return `${url.origin}${url.pathname.replace(/\/$/, '')}`
}

/**
 * Validate the dedicated Team listener bind independently of the private application server.
 * @param host - explicit bind address; all IPv4 interfaces or a private literal address.
 * @returns the validated address unchanged.
 */
export function validateTeamBindHost(host: string): string {
  if (host !== '0.0.0.0' && !privateAddress(host)) {
    throw new Error('Team listener must bind to a private IP address or 0.0.0.0')
  }
  return host.replace(/^\[|\]$/g, '')
}
