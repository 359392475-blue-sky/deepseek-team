/** Root navigation keeps the shared team page available without a private session. */

import { useEffect, useSyncExternalStore } from 'react'
import type { TeamBattleTeamSummary } from '@deepseek-ai/dsh-experimental-team-battle/client'
import type { TeamDirectoryPage } from './TeamDirectory.tsx'
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
  readonly getSelection: () => TeamNavigationSelection
  readonly select: (team: TeamBattleTeamSummary, resetPage?: boolean) => void
  readonly open: (page?: TeamDirectoryPage) => void
  readonly close: () => void
  readonly reflect: (opened: boolean) => void
  readonly consumePage: (revision: number) => void
}

/** Explicit team and form selected through shell navigation. */
export interface TeamNavigationSelection {
  readonly teamId?: TeamBattleTeamSummary['id']
  readonly page?: TeamDirectoryPage
  readonly revision: number
}

/**
 * Create mount-owned team selection without changing the private Session.
 * @param initialOpen - whether the initial route selects the team page.
 * @param showPanel - callback selecting the existing shell main column.
 * @returns navigation callbacks and reactive team selection.
 */
export function createTeamSpaceNavigation(initialOpen: boolean, showPanel: (opened: boolean) => void = () => {}): TeamSpaceNavigation {
  let selection: TeamNavigationSelection = { revision: 0 }
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
    showPanel(next)
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
    getSelection: () => selection,
    select: (team, resetPage = false) => {
      selection = { teamId: team.id, revision: selection.revision + (resetPage ? 1 : 0) }
      for (const listener of listeners) listener()
    },
    open: (page) => {
      if (page !== undefined) {
        selection = { ...selection, page, revision: selection.revision + 1 }
        for (const listener of listeners) listener()
      }
      setOpen(true)
      showPanel(true)
    },
    close: () => { setOpen(false); showPanel(false) },
    reflect: setOpen,
    consumePage: (revision) => {
      if (selection.revision !== revision || selection.page === undefined) return
      const { page: _page, ...remaining } = selection
      selection = remaining
      for (const listener of listeners) listener()
    },
  }
}

type RootTeamSpaceProps = PropsRuntime<'main'> & PropsLocale<typeof NS>
  & TeamBattleInjected & { navigation: TeamSpaceNavigation; journey: TeamJourneyInjected }

/**
 * Render Team Space inside the existing application's main column.
 * @param props - selection, translated copy, and authenticated Remote actions.
 * @returns the shared project page while keeping the shell sidebar available.
 */
export function RootTeamSpace({ navigation, ...props }: RootTeamSpaceProps) {
  const selection = useSyncExternalStore(navigation.subscribe, navigation.getSelection)
  useEffect(() => { navigation.consumePage(selection.revision) }, [navigation, selection.revision])
  return <div className={css.page}>
    <TeamSpaceScreen key={selection.revision} {...props} identity="team-space-root"
      {...selection.teamId === undefined ? {} : { selectedTeamId: selection.teamId }}
      {...selection.page === undefined ? {} : { initialPage: selection.page }}
      onSelectTeam={navigation.select} onConversation={navigation.close} />
  </div>
}

type TeamSpaceEntryProps = PropsRuntime<'sidebar.panellist'> & { readonly navigation: TeamSpaceNavigation }

/**
 * Supply the team icon to the shell-owned navigation row near New Session.
 * @param props - shell icon geometry.
 * @returns the team project icon.
 */
export function TeamSpaceEntry({ size, active, navigation }: TeamSpaceEntryProps) {
  useEffect(() => { navigation.reflect(active) }, [active, navigation])
  return <span data-team-space-entry=""><IconAgentPresetOutlineRegular size={size} /></span>
}
