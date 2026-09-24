/** Device-local workspace associations never enter shared team storage or private Session logs. */

import type { Context } from '@deepseek-ai/cordis'
import { defineDomain, type DomainGlobal } from '@deepseek-ai/dsh-storage-domain'
import { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import { z } from 'zod'
import { TeamBattleError } from './error.ts'
import { TeamBattleProjectId, type BindTeamWorkspaceRequest, type TeamBattleWorkspaceLink } from './types.ts'

const linkSchema = z.object({
  workspaceId: z.string().min(1).max(128).transform(WorkspaceId),
  teamId: z.string().min(1).max(128).transform(TeamBattleProjectId),
}).strict()
const stateSchema = z.object({ links: z.array(linkSchema) }).strict()
  .refine(state => new Set(state.links.map(link => link.workspaceId)).size === state.links.length,
    'workspace can belong to only one local team association')
const domainSpec = defineDomain({
  name: 'team_battle_workspace_links', version: 1,
  global: { schema: stateSchema, initial: { links: [] } }, tables: {},
})

/** Owns durable, explicitly selected workspace-to-team associations on this device. */
export class TeamWorkspaceLinks {
  private global?: DomainGlobal<z.infer<typeof stateSchema>>
  private tail: Promise<void> = Promise.resolve()
  private accepting = true

  /** @param ctx - local storage and optional workspace registry owner. */
  constructor(private readonly ctx: Context) {}

  /** Open local associations independently of shared team generations. */
  async open(): Promise<void> {
    const domain = await this.ctx.storageDomain.open(domainSpec)
    this.global = domain.global
    this.ctx.effect(() => async () => {
      this.accepting = false
      await this.tail
      await domain.close()
    }, 'teamBattle.workspaceLinksClose()')
  }

  /**
   * Read associations whose local workspace is still registered.
   * @returns current local workspace-to-team links.
   */
  list(): readonly TeamBattleWorkspaceLink[] {
    const registry = this.ctx.get('workspaceRegistry')
    return this.state().links.filter(link => registry?.get(link.workspaceId) !== undefined)
  }

  /**
   * Bind a registered workspace, replacing its prior local team association.
   * @param request - an already-authorized team and explicitly selected local workspace.
   * @returns durable associations on this device.
   */
  bind(request: BindTeamWorkspaceRequest): Promise<readonly TeamBattleWorkspaceLink[]> {
    if (!this.accepting) return Promise.reject(new Error('Team workspace associations are closing'))
    const operation = this.tail.then(async () => {
      const parsed = linkSchema.safeParse(request)
      if (!parsed.success) throw new TeamBattleError('invalid team workspace association', 'TEAM_BATTLE_REJECTED')
      const link = parsed.data
      if (this.ctx.get('workspaceRegistry')?.get(link.workspaceId) === undefined) {
        throw new TeamBattleError('local workspace is not registered', 'TEAM_BATTLE_NOT_FOUND')
      }
      await this.storage().set({ links: [...this.state().links.filter(previous => previous.workspaceId !== link.workspaceId), link] })
      return this.list()
    })
    this.tail = operation.then(() => {}, () => {})
    return operation
  }

  private state(): z.infer<typeof stateSchema> { return this.storage().get() }

  private storage(): DomainGlobal<z.infer<typeof stateSchema>> {
    if (this.global === undefined) throw new Error('Team workspace associations are not initialized')
    return this.global
  }
}
