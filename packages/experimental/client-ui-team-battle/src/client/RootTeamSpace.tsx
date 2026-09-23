/** Root navigation keeps the shared team page available without a private session. */

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { IconAgentPresetOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { TeamBattleInjected, TeamJourneyInjected } from './actions.ts'
import { NS } from './locales.ts'
import { TeamSpaceScreen } from './TeamSpaceView.tsx'
import css from './RootTeamSpace.module.css'

/** Shared navigation state for the root entry and the team screen. */
export interface TeamSpaceNavigation {
  readonly subscribe: (listener: () => void) => () => void
  readonly getSnapshot: () => boolean
  readonly open: () => void
  readonly close: () => void
}

/**
 * Create one mount-owned navigation state, optionally opening a team deep link.
 * @param initialOpen - whether the initial route selects the team page.
 * @returns navigation callbacks and a React external store.
 */
export function createTeamSpaceNavigation(initialOpen: boolean): TeamSpaceNavigation {
  const routeOpened = (): boolean => {
    if (typeof window === 'undefined') return initialOpen
    const url = new URL(window.location.href)
    return url.hash === '#team' || url.searchParams.get('team') === '1'
  }
  let opened = initialOpen || routeOpened()
  const listeners = new Set<() => void>()
  const syncRoute = (): void => {
    const next = routeOpened()
    if (next === opened) return
    opened = next
    for (const listener of listeners) listener()
  }
  const setOpen = (next: boolean): void => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      url.searchParams.delete('team')
      if (next) url.hash = 'team'
      else if (url.hash === '#team') url.hash = ''
      window.history.replaceState(window.history.state, '', url)
    }
    if (next === opened) return
    opened = next
    for (const listener of listeners) listener()
  }
  return {
    subscribe: (listener) => {
      if (listeners.size === 0 && typeof window !== 'undefined') {
        window.addEventListener('popstate', syncRoute)
        window.addEventListener('hashchange', syncRoute)
      }
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0 && typeof window !== 'undefined') {
          window.removeEventListener('popstate', syncRoute)
          window.removeEventListener('hashchange', syncRoute)
        }
      }
    },
    getSnapshot: () => opened,
    open: () => { setOpen(true) },
    close: () => { setOpen(false) },
  }
}

type RootTeamSpaceProps = PropsRuntime<'shell.overlay'> & PropsLocale<typeof NS>
  & TeamBattleInjected & { navigation: TeamSpaceNavigation; journey: TeamJourneyInjected }

/**
 * Render the team page above the application while preserving the private conversation.
 * @param props - root navigation, translated copy, and authenticated Remote actions.
 * @returns the shared team page, or no overlay when the conversation is selected.
 */
export function RootTeamSpace({ navigation, ...props }: RootTeamSpaceProps) {
  const opened = useSyncExternalStore(navigation.subscribe, navigation.getSnapshot)
  const page = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!opened || page.current === null) return
    const overlay = page.current.closest('[data-shell-overlay]')
    const previousFocus = document.activeElement
    const covered = Array.from(overlay?.parentElement?.children ?? [])
      .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== overlay)
      .map(element => ({ element, inert: element.inert }))
    for (const { element } of covered) element.inert = true
    page.current.focus()
    return () => {
      for (const { element, inert } of covered) element.inert = inert
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus()
    }
  }, [opened])
  return opened ? <div ref={page} tabIndex={-1} className={css.page}>
    <TeamSpaceScreen {...props} identity="team-space-root" onConversation={navigation.close} />
  </div> : null
}

type TeamSpaceEntryProps = PropsRuntime<'sidebar.footer.action'> & PropsLocale<typeof NS>
  & { navigation: TeamSpaceNavigation }

/**
 * Make team navigation available even when the current workspace has no session.
 * @param props - sidebar width, translations, and the shared navigation state.
 * @returns the team navigation button.
 */
export function TeamSpaceEntry({ navigation, wide, t }: TeamSpaceEntryProps) {
  return (
    <button type="button" className={css.entry} data-team-space-entry="" title={t('view.team')} aria-label={t('view.team')} onClick={navigation.open}>
      <IconAgentPresetOutlineRegular size={20} />{wide && <span>{t('view.team')}</span>}
    </button>
  )
}
