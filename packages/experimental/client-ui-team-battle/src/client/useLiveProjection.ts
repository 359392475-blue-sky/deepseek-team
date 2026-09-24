/** Latest-response-wins polling shared by the project and file projections. */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RemoteFailure, RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import { failureText } from './actions.ts'

const POLL_INTERVAL_MS = 2_500

/** Projection state; only successful Remote responses replace the current value. */
export interface LiveProjectionState<T> {
  readonly view: T | null
  readonly loading: boolean
  readonly pending: boolean
  readonly error: string | null
  readonly reportError: (message: string) => void
  readonly refresh: () => Promise<boolean>
  readonly mutate: (operation: () => Promise<RemoteResult<T>>) => Promise<T | undefined>
}

/**
 * Poll one projection and serialize mutations without accepting stale responses.
 * @param load - authoritative Remote read operation.
 * @param identity - mounted identity whose change discards browser-local state.
 * @param formatFailure - localized display for a typed Remote failure; other errors retain their message.
 * @returns live data and contained, latest-wins read and write helpers.
 */
export function useLiveProjection<T>(
  load: () => Promise<RemoteResult<T>>, identity: string, formatFailure: (error: RemoteFailure) => string = failureText,
): LiveProjectionState<T> {
  const [view, setView] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const generation = useRef(0)
  const inFlight = useRef<{ generation: number; mutation: boolean } | null>(null)
  const active = useRef(false)
  const reportError = useCallback((message: string): void => { setError(message) }, [])
  const perform = useCallback(async (operation: () => Promise<RemoteResult<T>>, mutation: boolean): Promise<T | undefined> => {
    if (inFlight.current !== null && (!mutation || inFlight.current.mutation)) return undefined
    const requested = ++generation.current
    inFlight.current = { generation: requested, mutation }
    if (mutation) setPending(true)
    try {
      const result = await operation()
      if (!active.current || requested !== generation.current) return undefined
      if (!result.ok) { setError(formatFailure(result.error)); return undefined }
      setView(result.value)
      setError(null)
      return result.value
    } catch (cause) {
      if (active.current && requested === generation.current) setError(cause instanceof Error ? cause.message : String(cause))
      return undefined
    } finally {
      if (active.current && requested === generation.current) {
        inFlight.current = null
        setLoading(false)
        if (mutation) setPending(false)
      }
    }
  }, [formatFailure])
  const refresh = useCallback(async (): Promise<boolean> => (await perform(load, false)) !== undefined, [load, perform])
  const mutate = useCallback((operation: () => Promise<RemoteResult<T>>): Promise<T | undefined> => perform(operation, true), [perform])
  useEffect(() => {
    active.current = true
    generation.current += 1
    inFlight.current = null
    setView(null)
    setLoading(true)
    setPending(false)
    setError(null)
    void refresh()
    const timer = window.setInterval(() => { void refresh() }, POLL_INTERVAL_MS)
    return () => { active.current = false; generation.current += 1; window.clearInterval(timer) }
  }, [identity, refresh])
  return { view, loading, pending, error, reportError, refresh, mutate }
}
