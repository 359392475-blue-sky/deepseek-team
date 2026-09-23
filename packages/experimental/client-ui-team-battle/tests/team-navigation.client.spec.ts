// @vitest-environment jsdom
/** Team navigation is independent of the private session and preserves URL parameters. */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTeamSpaceNavigation } from '../src/client/RootTeamSpace.tsx'

afterEach(() => { window.history.replaceState(null, '', '/') })

describe('root team navigation', () => {
  it('opens without a session, preserves URL parameters, and removes only its own route on close', () => {
    window.history.replaceState({ preserved: true }, '', '/?existing=keep')
    const navigation = createTeamSpaceNavigation(false)
    const changed = vi.fn()
    const unsubscribe = navigation.subscribe(changed)
    navigation.open()
    expect(navigation.getSnapshot()).toBe(true)
    expect(window.location.search).toBe('?existing=keep')
    expect(window.location.hash).toBe('#team')
    expect(window.history.state).toEqual({ preserved: true })
    navigation.open()
    expect(changed).toHaveBeenCalledOnce()
    navigation.close()
    expect(window.location.search).toBe('?existing=keep')
    expect(navigation.getSnapshot()).toBe(false)
    unsubscribe()
    navigation.open()
    expect(changed).toHaveBeenCalledTimes(2)
  })
})

describe('Team Space root navigation', () => {
  it('opens the fragment retained by authentication redirects and clears both deep links on close', () => {
    window.history.replaceState(null, '', '/?team=1#team')
    const navigation = createTeamSpaceNavigation(false)
    expect(navigation.getSnapshot()).toBe(true)
    const listener = vi.fn()
    const unsubscribe = navigation.subscribe(listener)
    navigation.close()
    expect(navigation.getSnapshot()).toBe(false)
    expect(window.location.hash).toBe('')
    expect(window.location.search).toBe('')
    navigation.open()
    expect(window.location.hash).toBe('#team')
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
  })

  it('follows fragment and history changes and disposes its listeners', () => {
    const navigation = createTeamSpaceNavigation(false)
    const listener = vi.fn()
    const unsubscribe = navigation.subscribe(listener)
    window.history.replaceState(null, '', '/#team')
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    expect(navigation.getSnapshot()).toBe(true)
    window.history.replaceState(null, '', '/')
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(navigation.getSnapshot()).toBe(false)
    window.history.replaceState(null, '', '/?team=1')
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(navigation.getSnapshot()).toBe(true)
    unsubscribe()
    window.history.replaceState(null, '', '/')
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(listener).toHaveBeenCalledTimes(3)
    expect(navigation.getSnapshot()).toBe(true)
  })
})
