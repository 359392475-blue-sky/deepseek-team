// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { TeamBattleView } from '@deepseek-ai/dsh-experimental-team-battle/client'
import { TeamBattleMemberId, TeamBattleProjectId, TeamBattleWeaponId } from '@deepseek-ai/dsh-experimental-team-battle/src/types.ts'
import { en as commonEn } from '@deepseek-ai/dsh-client-locale/src/locales/en.ts'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { TeamBattleInjected } from '../src/client/actions.ts'
import { FlightGamePanel, type FlightGamePanelProps } from '../src/client/FlightGamePanel.tsx'
import { en } from '../src/client/locales.ts'

const SESSION = 'flight-session' as SessionId
const view: TeamBattleView = {
  simulationEnabled: false,
  revision: 3,
  localMemberId: TeamBattleMemberId('product'),
  project: { id: TeamBattleProjectId('project-1'), name: 'Flight Project', goal: 'Ship' },
  members: [
    { id: TeamBattleMemberId('product'), name: 'Blue', role: 'Product', status: 'online', color: '#1357c5' },
    { id: TeamBattleMemberId('engineering'), name: 'Engineering', role: 'Engineering', status: 'online' },
    { id: TeamBattleMemberId('quality'), name: 'Quality', role: 'QA', status: 'idle' },
    { id: TeamBattleMemberId('design'), name: 'Design', role: 'UI', status: 'offline' },
  ],
  tasks: [], contexts: [], artifacts: [], activity: [],
  weaponGrants: [{ id: TeamBattleWeaponId('weapon-1'), eventId: 'query-1', memberId: TeamBattleMemberId('engineering'), kind: 'query', shieldDamage: 3, createdAt: Date.now() }],
  progress: { acceptedWeight: 2, totalWeight: 10, percent: 20, coreHp: 80, coreMaxHp: 100 },
  combatShield: { hp: 62, maxHp: 100 },
}

const context: Partial<CanvasRenderingContext2D> = {
  save: vi.fn(), restore: vi.fn(), drawImage: vi.fn(), setTransform: vi.fn(), clearRect: vi.fn(),
  fillRect: vi.fn(),
  globalAlpha: 1, fillStyle: '',
}

class ImageStub {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  set src(_value: string) { queueMicrotask(() => { this.onload?.() }) }
}

beforeEach(() => {
  vi.stubGlobal('Image', ImageStub)
  vi.stubGlobal('ResizeObserver', class { observe(): void {} disconnect(): void {} })
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 360, height: 400, top: 0, left: 0, right: 360, bottom: 400, x: 0, y: 0, toJSON: () => ({}) })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function actions(overrides: Partial<TeamBattleInjected> = {}): TeamBattleInjected {
  const success = () => Promise.resolve({ ok: true as const, value: view })
  const fileAction = () => Promise.reject(new Error('Flight must not access published files'))
  return {
    space: fileAction,
    createFolder: fileAction,
    publishFile: fileAction,
    updateSpaceItem: fileAction,
    readFile: fileAction,
    sendFile: fileAction,
    submitFile: fileAction,
    load: success,
    createTask: success,
    updateTask: success,
    publishContext: success,
    publishArtifact: success,
    reviewArtifact: success,
    consumeWeapon: success,
    heartbeat: success,
    ...overrides,
  }
}

function props(injected: TeamBattleInjected): FlightGamePanelProps {
  return { sessionId: SESSION, t: makeTranslate(en, commonEn), ...injected } as FlightGamePanelProps
}

describe('FlightGamePanel', () => {
  it('shows four-member formation and distinct shield, core HP, and real progress values', async () => {
    render(<FlightGamePanel {...props(actions())} />)
    expect(screen.getByRole('button', { name: 'Expand game' }).getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('img', { name: /Arrow keys/u })).toBeNull()
    expect(requestAnimationFrame).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Expand game' }))
    expect(await screen.findByText('Flight Project')).toBeTruthy()
    expect(screen.getByText('62 / 100')).toBeTruthy()
    expect(screen.getByText('80 / 100')).toBeTruthy()
    expect(screen.getByText('20%')).toBeTruthy()
    expect(screen.getByText('4/4')).toBeTruthy()
    expect(screen.getByTitle('Blue · Product').getAttribute('style')).toContain('#1357c5')
    expect(screen.getByLabelText('3 of 3 fighters remaining').querySelectorAll('img')).toHaveLength(3)
  })

  it('consumes a durable Query weapon through click or focused Space without changing project progress', async () => {
    const consumedView = { ...view, weaponGrants: [{ ...view.weaponGrants[0]!, consumedAt: Date.now() }] }
    const consumeWeapon = vi.fn(() => Promise.resolve({ ok: true as const, value: consumedView }))
    const first = render(<FlightGamePanel {...props(actions({ consumeWeapon }))} />)
    fireEvent.click(screen.getByRole('button', { name: 'Expand game' }))
    const fire = await screen.findByRole('button', { name: 'Fire special weapon' })
    fireEvent.click(fire)
    await waitFor(() => { expect(consumeWeapon).toHaveBeenCalledWith({ weaponId: 'weapon-1' }) })
    expect(screen.getByText('20%')).toBeTruthy()
    first.unmount()

    const consumeBySpace = vi.fn(actions().consumeWeapon)
    render(<FlightGamePanel {...props(actions({ consumeWeapon: consumeBySpace }))} />)
    fireEvent.click(screen.getByRole('button', { name: 'Expand game' }))
    const canvas = await screen.findByRole('img', { name: /Arrow keys/u })
    fireEvent.keyDown(canvas, { code: 'Space', key: ' ' })
    await waitFor(() => { expect(consumeBySpace).toHaveBeenCalledWith({ weaponId: 'weapon-1' }) })
  })

  it('supports pause and browser-local restart controls', async () => {
    render(<FlightGamePanel {...props(actions())} />)
    fireEvent.click(screen.getByRole('button', { name: 'Expand game' }))
    await screen.findByText('Flight Project')
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    expect(screen.getByText('Pause')).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: 'Resume' })[1]!)
    fireEvent.click(screen.getByRole('button', { name: 'Restart' }))
    expect(screen.getByLabelText('3 of 3 fighters remaining')).toBeTruthy()
  })

  it('preserves the paused canvas across collapse and leaves chat arrow keys alone', async () => {
    render(<FlightGamePanel {...props(actions())} />)
    fireEvent.click(screen.getByRole('button', { name: 'Expand game' }))
    await screen.findByText('Flight Project')
    const canvas = screen.getByRole('img', { name: /Arrow keys/u })
    expect(fireEvent.keyDown(window, { key: 'ArrowLeft' })).toBe(true)
    expect(fireEvent.keyDown(canvas, { key: 'ArrowLeft' })).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    fireEvent.click(screen.getByRole('button', { name: 'Collapse game' }))
    expect(screen.queryByRole('img', { name: /Arrow keys/u })).toBeNull()
    expect(cancelAnimationFrame).toHaveBeenCalled()
    expect(fireEvent.keyDown(canvas, { key: 'ArrowLeft' })).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Expand game' }))
    expect(screen.getByRole('img', { name: /Arrow keys/u })).toBe(canvas)
    expect(screen.getAllByRole('button', { name: 'Resume' })).toHaveLength(2)
    expect(screen.getByLabelText('3 of 3 fighters remaining')).toBeTruthy()
  })
})
