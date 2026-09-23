/** Bounded UTF-8 intake for the Team Battle HTTP connector. */

import type { IncomingMessage } from 'node:http'

/** HTTP refusal whose detail contains no request content. */
export class TeamBattleHttpError extends Error {
  override readonly name = 'TeamBattleHttpError'

  /**
   * @param status - response status owned by connector intake.
   * @param message - content-safe response detail.
   */
  constructor(
    readonly status: 400 | 401 | 405 | 413 | 415 | 503,
    message: string,
  ) {
    super(message)
  }
}

function contentLength(request: IncomingMessage): number | undefined {
  const value = request.headers['content-length']
  if (value === undefined) return undefined
  if (!/^(0|[1-9]\d*)$/.test(value)) {
    throw new TeamBattleHttpError(400, 'invalid Content-Length')
  }
  const length = Number(value)
  if (!Number.isSafeInteger(length)) {
    throw new TeamBattleHttpError(413, 'request body is too large')
  }
  return length
}

/**
 * Read one request body as bounded, strict UTF-8.
 * @param request - incoming request before another parser consumes it.
 * @param maxBodyBytes - positive byte ceiling.
 * @returns decoded request text after EOF.
 * @throws {TeamBattleHttpError} for invalid length, excessive bytes, invalid UTF-8, or an aborted stream.
 */
export async function readBoundedUtf8Body(
  request: IncomingMessage,
  maxBodyBytes: number,
): Promise<string> {
  const declared = contentLength(request)
  if (declared !== undefined && declared > maxBodyBytes) {
    request.resume()
    throw new TeamBattleHttpError(413, 'request body is too large')
  }

  const chunks: Buffer[] = []
  let size = 0
  try {
    for await (const raw of request) {
      const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as string)
      size += chunk.byteLength
      if (size > maxBodyBytes) {
        request.resume()
        throw new TeamBattleHttpError(413, 'request body is too large')
      }
      chunks.push(chunk)
    }
  } catch (error: unknown) {
    if (error instanceof TeamBattleHttpError) throw error
    throw new TeamBattleHttpError(400, 'request body was aborted')
  }
  if (!request.complete) throw new TeamBattleHttpError(400, 'request body was aborted')
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, size))
  } catch {
    // TextDecoder is the only statement in the try; connector JSON must be valid UTF-8.
    throw new TeamBattleHttpError(400, 'request body is not valid UTF-8')
  }
}
