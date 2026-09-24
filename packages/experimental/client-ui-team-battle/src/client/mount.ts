/** Source-safe Team Battle browser registrations and generated Remote lifecycle. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-experimental-team-battle/remote'
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import type { TeamBattleInjected, TeamJourneyInjected, TeamCollaborationInjected } from './actions.ts'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client'
import { TeamConversationMembers, TeamEditionBadge, TeamHomeActions, TeamProjectSidebar } from './TeamNavigation.tsx'
import { NAV_NS, navEn, navZh, type TeamNavigationKey } from './navigation-locales.ts'
import { FlightGamePanel } from './FlightGamePanel.tsx'
import { en, NS, zh, type TeamBattleKey } from './locales.ts'
import { TeamSpaceView } from './TeamSpaceView.tsx'
import { createTeamSpaceNavigation, RootTeamSpace, TeamSpaceEntry } from './RootTeamSpace.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Team Battle project-space and leisure-game copy. */
    'team-battle': TeamBattleKey
    'team-navigation': TeamNavigationKey
  }
}

/** Required browser services for Remote, locale, and slot registration. */
export const inject = ['remote', 'slots', 'locale', 'layout', 'uiWorkspace', 'workspaces']

function registerUi(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'client-ui-team-battle: dictionaries')
  ctx.effect(() => ctx.locale.register(NAV_NS, { zh: navZh, en: navEn }), 'client-ui-team-battle: navigation dictionaries')
  const t = ctx.locale.bind(NS)
  const actions: TeamBattleInjected = {
    load: async input => await ctx.remote.teamBattle.view(input),
    createTask: async input => await ctx.remote.teamBattle.createTask(input),
    updateTask: async input => await ctx.remote.teamBattle.updateTask(input),
    publishContext: async input => await ctx.remote.teamBattle.publishContext(input),
    publishArtifact: async input => await ctx.remote.teamBattle.publishArtifact(input),
    reviewArtifact: async input => await ctx.remote.teamBattle.reviewArtifact(input),
    consumeWeapon: async input => await ctx.remote.teamBattle.consumeWeapon(input),
    heartbeat: async input => await ctx.remote.teamBattle.heartbeat(input),
    space: async input => await ctx.remote.teamBattle.space(input),
    createFolder: async input => await ctx.remote.teamBattle.createFolder(input),
    publishFile: async input => await ctx.remote.teamBattle.publishFile(input),
    updateSpaceItem: async input => await ctx.remote.teamBattle.updateSpaceItem(input),
    readFile: async input => await ctx.remote.teamBattle.readFile(input),
    sendFile: async input => await ctx.remote.teamBattle.sendFile(input),
    submitFile: async input => await ctx.remote.teamBattle.submitFile(input),
  }

  const journey: TeamJourneyInjected = {
    summary: async input => await ctx.remote.teamBattle.summary(input),
    teams: async () => await ctx.remote.teamBattle.teams(),
    createTeam: async input => await ctx.remote.teamBattle.createTeam(input),
    joinRemote: async input => await ctx.remote.teamBattle.joinRemote(input),
    createInvite: async input => await ctx.remote.teamBattle.createInvite(input),
    revokeInvite: async input => await ctx.remote.teamBattle.revokeInvite(input),
    revokeMember: async input => await ctx.remote.teamBattle.revokeMember(input),
  }

  const panelId = 'team-battle' as MainPanelId
  const navigation = createTeamSpaceNavigation(
    typeof window !== 'undefined' && new URL(window.location.href).searchParams.get('team') === '1',
    (opened) => { ctx.layout.selectPanel(opened ? panelId : null) },
  )
  const collaboration: TeamCollaborationInjected = {
    workspaceLinks: async () => await ctx.remote.teamBattle.workspaceLinks(),
    bindWorkspace: async input => await ctx.remote.teamBattle.bindWorkspace(input),
    openWorkspace: async (id) => { await ctx.uiWorkspace.openWorkspace(id); navigation.close() },
    createWorkspace: async path => (await ctx.workspaces.create({ path })).workspaceId,
  }
  ctx.slots.inject('main', () => {
    const dispose = ctx.slots.register({
      name: 'main', key: panelId, locale: NS,
      inject: () => ({ ...actions, journey, navigation }),
    }, RootTeamSpace)
    if (navigation.getSnapshot()) ctx.layout.selectPanel(panelId)
    return dispose
  })
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist', id: panelId, order: -10,
    label: () => t('view.team'), locale: NS, inject: () => ({ navigation }),
  }, TeamSpaceEntry))
  ctx.slots.inject('sidebar.sections', () => ctx.slots.register({
    name: 'sidebar.sections', id: 'team-projects', locale: NAV_NS,
    inject: () => ({ journey, collaboration, navigation }),
  }, TeamProjectSidebar))
  ctx.slots.inject('conversation.hero.badge', () => ctx.slots.register({
    name: 'conversation.hero.badge', locale: NAV_NS,
  }, TeamEditionBadge))
  ctx.slots.inject('conversation.hero.actions', () => ctx.slots.register({
    name: 'conversation.hero.actions', id: 'team-projects', locale: NAV_NS,
    inject: () => ({ navigation }),
  }, TeamHomeActions))
  ctx.slots.inject('conversation.session.header.collaboration', () => ctx.slots.register({
    name: 'conversation.session.header.collaboration', id: 'team-members', locale: NAV_NS,
    inject: () => ({ collaboration, journey, load: actions.load }),
  }, TeamConversationMembers))

  ctx.slots.inject('conversation.chat.sidecar', () => ctx.slots.register({
    name: 'conversation.chat.sidecar',
    locale: NS,
    inject: () => actions,
  }, FlightGamePanel))

  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'team',
    order: 20,
    label: () => t('view.team'),
    locale: NS,
    inject: () => ({ ...actions, journey }),
  }, TeamSpaceView))
}

/**
 * Mount one generated Team Battle Remote contribution, then register both browser surfaces.
 * @param ctx - Client Context carrying Remote, locale, and slot services.
 * @param contribution - generated Team Battle descriptors selected by the browser entry.
 * @returns disposer for both UI registrations and the Remote namespace.
 */
export async function mountTeamBattleUi(
  ctx: ClientContext,
  contribution: TypertRemoteContribution,
): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(contribution)
  const ui = ctx.inject(['remote.teamBattle', 'slots', 'locale', 'layout', 'uiWorkspace', 'workspaces'], registerUi)
  try {
    await ui
  } catch (error) {
    await ui.dispose()
    await disposeRemote()
    throw error
  }
  return async () => {
    await ui.dispose()
    await disposeRemote()
  }
}
