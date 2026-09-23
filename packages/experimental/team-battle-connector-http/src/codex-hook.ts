#!/usr/bin/env node
/** Content-free Codex UserPromptSubmit helper for Team Battle Query grants. */

import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const MAX_CODEX_HOOK_STDIN_BYTES = 1_048_576
const MAX_HOOK_ID_BYTES = 200

/** Environment values needed by the external Codex command hook. */
export interface CodexHookEnvironment {
  readonly TEAM_BATTLE_URL?: string
  readonly TEAM_BATTLE_TOKEN?: string
  readonly TEAM_BATTLE_MEMBER_ID?: string
}

/** Injectable operation dependencies used by the command entrypoint and tests. */
export interface CodexHookOperation {
  readonly stdin: string
  readonly env: CodexHookEnvironment
  readonly fetch: typeof globalThis.fetch
  readonly now?: () => number
}

function requiredEnv(env: CodexHookEnvironment, key: keyof CodexHookEnvironment): string {
  const value = env[key]
  if (value === undefined || value.trim() === '') throw new Error(`${key} must be configured`)
  if (/[\r\n]/.test(value)) throw new Error(`${key} must not contain line breaks`)
  return value
}

function hookId(value: unknown, field: 'session_id' | 'turn_id'): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Codex hook stdin must contain a non-empty ${field}`)
  }
  const result = value.trim()
  if (Buffer.byteLength(result) > MAX_HOOK_ID_BYTES) {
    throw new Error(`Codex hook ${field} exceeds ${String(MAX_HOOK_ID_BYTES)} UTF-8 bytes`)
  }
  return result
}

function parseHookIds(stdin: string): { sessionId: string; turnId: string } {
  let decoded: unknown
  try {
    decoded = JSON.parse(stdin)
  } catch {
    // JSON.parse is the only statement in the try; prompt text is never reflected.
    throw new Error('Codex hook stdin must be valid JSON')
  }
  if (decoded === null || typeof decoded !== 'object' || Array.isArray(decoded)) {
    throw new Error('Codex hook stdin must be a JSON object')
  }
  const record = decoded as Record<string, unknown>
  return {
    sessionId: hookId(record.session_id, 'session_id'),
    turnId: hookId(record.turn_id, 'turn_id'),
  }
}

function connectorUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    // URL construction is the only statement in the try; configuration values are not request data.
    throw new Error('TEAM_BATTLE_URL must be an absolute HTTP(S) URL')
  }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:')
    || url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') {
    throw new Error('TEAM_BATTLE_URL must be an HTTP(S) URL without credentials, query, or fragment')
  }
  return url.href
}

function eventId(sessionId: string, turnId: string): string {
  return `codex:${String(Buffer.byteLength(sessionId))}:${sessionId}:${turnId}`
}

/**
 * Send one deterministic Query signal without copying prompt content.
 * @param operation - stdin text, environment, fetch implementation, and optional clock.
 * @returns after the authenticated endpoint accepts this event or its duplicate.
 */
export async function sendCodexQuerySignal(operation: CodexHookOperation): Promise<void> {
  if (Buffer.byteLength(operation.stdin) > MAX_CODEX_HOOK_STDIN_BYTES) {
    throw new Error(`Codex hook stdin exceeds ${String(MAX_CODEX_HOOK_STDIN_BYTES)} UTF-8 bytes`)
  }
  const { sessionId, turnId } = parseHookIds(operation.stdin)
  const url = connectorUrl(requiredEnv(operation.env, 'TEAM_BATTLE_URL'))
  const token = requiredEnv(operation.env, 'TEAM_BATTLE_TOKEN')
  const memberId = requiredEnv(operation.env, 'TEAM_BATTLE_MEMBER_ID').trim()
  const response = await operation.fetch(url, {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      version: 1,
      type: 'query',
      eventId: eventId(sessionId, turnId),
      memberId,
      occurredAt: (operation.now ?? Date.now)(),
    }),
  })
  if (!response.ok) throw new Error(`Team Battle endpoint returned HTTP ${String(response.status)}`)
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const raw of process.stdin) {
    const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as string)
    size += chunk.byteLength
    if (size > MAX_CODEX_HOOK_STDIN_BYTES) {
      throw new Error(`Codex hook stdin exceeds ${String(MAX_CODEX_HOOK_STDIN_BYTES)} UTF-8 bytes`)
    }
    chunks.push(chunk)
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, size))
}

async function main(): Promise<void> {
  await sendCodexQuerySignal({
    stdin: await readStdin(),
    env: process.env,
    fetch: globalThis.fetch,
  })
}

const invokedPath = process.argv[1]
if (invokedPath !== undefined && import.meta.url === pathToFileURL(resolve(invokedPath)).href) {
  void main().catch((error: unknown) => {
    process.stderr.write(`team-battle-codex-hook: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
