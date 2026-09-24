/** Team-only navigation and workspace collaboration copy. */
export const NAV_NS = 'team-navigation'
/** Simplified Chinese navigation labels. */
export const navZh = {
  'badge': '团队版',
  'section': '团队项目',
  'create': '创建团队项目',
  'join': '通过邀请链接加入',
  'empty': '还没有加入团队项目',
  'chat': '打开项目对话',
  'bind.title': '选择本机项目文件夹',
  'bind.description': '将本机工作区关联到这个团队项目。私聊和本机文件不会自动共享。',
  'bind.choose': '选择其他文件夹',
  'bind.cancel': '取消',
  'members': '项目协作者',
  'loading': '正在载入团队项目…',
  'retry': '重试',
} as const
/** Navigation dictionary keys. */
export type TeamNavigationKey = keyof typeof navZh
/** English navigation labels. */
export const navEn: Record<TeamNavigationKey, string> = {
  'badge': 'Team Edition',
  'section': 'Team projects',
  'create': 'Create team project',
  'join': 'Join by invitation link',
  'empty': 'No team projects yet',
  'chat': 'Open project conversation',
  'bind.title': 'Choose a local project folder',
  'bind.description': 'Link this local workspace to the team project. Private chats and local files are not shared automatically.',
  'bind.choose': 'Choose another folder',
  'bind.cancel': 'Cancel',
  'members': 'Project collaborators',
  'loading': 'Loading team projects…',
  'retry': 'Retry',
}
