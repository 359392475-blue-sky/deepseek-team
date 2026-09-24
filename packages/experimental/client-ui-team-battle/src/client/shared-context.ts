/** Plain-text handoff assembled only from published Team Space projections. */

import type { TeamBattleFileView, TeamBattleSpaceView, TeamBattleTaskView, TeamBattleView } from '@deepseek-ai/dsh-experimental-team-battle/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { NS } from './locales.ts'

/**
 * Format shared decisions, tasks, file references, and review feedback for a personal AI conversation.
 * @param view - published project state and this device's member identity.
 * @param space - published file and folder metadata; file contents are downloaded separately.
 * @param t - localized handoff labels and usage instructions.
 * @param task - optional task that narrows the work and review sections.
 * @returns clipboard text without private conversations, credentials, or local directory paths.
 */
export function formatSharedContext(view: TeamBattleView, space: Pick<TeamBattleSpaceView, 'files' | 'folders'>, t: PropsLocale<typeof NS>['t'], task?: TeamBattleTaskView): string {
  const filePath = (file: TeamBattleFileView): string => {
    const names = [file.name]
    let parent = space.folders.find(folder => folder.id === file.parentId)
    while (parent !== undefined) { names.unshift(parent.name); parent = space.folders.find(folder => folder.id === parent?.parentId) }
    return `/${names.join('/')}`
  }
  const memberName = (id: string): string => view.members.find(member => member.id === id)?.name ?? id
  const local = view.members.find(member => member.id === view.localMemberId)
  const tasks = task === undefined ? view.tasks : [task]
  const artifacts = view.artifacts.filter(artifact => task === undefined || artifact.taskId === task.id)
  const sections = [
    `# ${view.project.name}\n\n${t('project.goal')}: ${view.project.goal}`,
    t('journey.contextInstructions'),
    ...(local === undefined ? [] : [`${t('journey.memberName')}: ${local.name}\n${t('journey.role')}: ${local.role}`]),
    `## ${t('tabs.tasks')}\n\n${tasks.map(item => [
      `### ${item.title}`,
      item.description,
      `${t('tasks.owner')}: ${item.ownerMemberId === undefined ? t('tasks.unclaimed') : memberName(item.ownerMemberId)}`,
      `${t('files.status')}: ${t(`task.${item.status}`)}`,
    ].join('\n\n')).join('\n\n') || t('common.empty')}`,
    `## ${t('tabs.context')}\n\n${view.contexts.slice().sort((a, b) => a.createdAt - b.createdAt).map(context => [
      `### ${context.summary}`,
      `${t('context.source')}: ${memberName(context.createdByMemberId)}`,
      ...(['decisions', 'blockers', 'nextSteps', 'sourceRefs'] as const).flatMap(field => context[field].length === 0 ? [] : [
        `${t(field === 'sourceRefs' ? 'context.sources' : `context.${field}`)}\n${context[field].map(value => `- ${value}`).join('\n')}`,
      ]),
    ].join('\n\n')).join('\n\n') || t('common.empty')}`,
    `## ${t('tabs.files')}\n\n${t('journey.contextFilesHint')}\n\n${space.files.map(file => [
      `- ${filePath(file)} (${file.versionLabel}; ${t('journey.contextFileId')}: ${file.id})`,
      file.note,
    ].filter(Boolean).join(' — ')).join('\n') || t('files.empty')}`,
    `## ${t('tabs.artifacts')}\n\n${artifacts.map(artifact => [
      `### ${artifact.name}`,
      `${t('artifacts.task')}: ${view.tasks.find(item => item.id === artifact.taskId)?.title ?? artifact.taskId}`,
      `${t('files.status')}: ${t(`artifact.${artifact.review.status}`)}`,
      ...(artifact.review.note === undefined ? [] : [`${t('artifacts.reviewNote')}: ${artifact.review.note}`]),
    ].join('\n\n')).join('\n\n') || t('common.empty')}`,
  ]
  return sections.join('\n\n')
}
