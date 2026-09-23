import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { sendCodexQuerySignal } from '../src/codex-hook.ts'

const ENV = {
  TEAM_BATTLE_URL: 'http://127.0.0.1:4173/team-battle/codex',
  TEAM_BATTLE_TOKEN: 'fixture-token',
  TEAM_BATTLE_MEMBER_ID: 'engineering',
}

describe('Team Battle Codex UserPromptSubmit helper', () => {
  it('publishes the bundled command path in the package payload', () => {
    const manifest = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as {
      readonly bin: Record<string, string>
      readonly exports: Record<string, { readonly default: string }>
      readonly files: readonly string[]
    }
    expect(manifest.bin['dsh-team-battle-codex-hook']).toBe('./lib/bin.js')
    expect(manifest.exports['./codex-hook']?.default).toBe('./lib/bin.js')
    expect(manifest.files).toContain('lib/bin.js')
  })

  it('sends only strict Query metadata and reuses one event id for a retried turn', async () => {
    const bodies: string[] = []
    const urls: string[] = []
    const authorizations: (string | null)[] = []
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      if (typeof _url !== 'string' || typeof init?.body !== 'string') {
        throw new Error('expected a string URL and JSON string body')
      }
      urls.push(_url)
      authorizations.push(new Headers(init.headers).get('authorization'))
      bodies.push(init.body)
      return new Response('{}', { status: bodies.length === 1 ? 202 : 200 })
    })
    const stdin = JSON.stringify({
      hook_event_name: 'UserPromptSubmit',
      session_id: 'session-1',
      turn_id: 'turn-2',
      prompt: 'never send this text',
    })
    await sendCodexQuerySignal({ stdin, env: ENV, fetch, now: () => 123 })
    await sendCodexQuerySignal({ stdin, env: ENV, fetch, now: () => 456 })

    const first = JSON.parse(bodies[0]!) as Record<string, unknown>
    const second = JSON.parse(bodies[1]!) as Record<string, unknown>
    expect(first).toEqual({
      version: 1,
      type: 'query',
      eventId: 'codex:9:session-1:turn-2',
      memberId: 'engineering',
      occurredAt: 123,
    })
    expect(second.eventId).toBe(first.eventId)
    expect(JSON.stringify(bodies)).not.toContain('never send this text')
    expect(urls).toEqual([ENV.TEAM_BATTLE_URL, ENV.TEAM_BATTLE_URL])
    expect(authorizations).toEqual(['Bearer fixture-token', 'Bearer fixture-token'])
  })

  it('fails loud for missing ids or endpoint configuration', async () => {
    const fetch = vi.fn()
    await expect(sendCodexQuerySignal({ stdin: '{}', env: ENV, fetch })).rejects.toThrow('session_id')
    await expect(sendCodexQuerySignal({
      stdin: JSON.stringify({ session_id: 's', turn_id: 't' }),
      env: {
        TEAM_BATTLE_URL: ENV.TEAM_BATTLE_URL,
        TEAM_BATTLE_MEMBER_ID: ENV.TEAM_BATTLE_MEMBER_ID,
      },
      fetch,
    })).rejects.toThrow('TEAM_BATTLE_TOKEN')
    expect(fetch).not.toHaveBeenCalled()
  })
})
