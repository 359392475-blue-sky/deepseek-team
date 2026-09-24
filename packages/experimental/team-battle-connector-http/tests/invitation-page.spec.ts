import { createHash } from 'node:crypto'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import { renderTeamInvitationPage, teamInvitationPage, teamInvitationPagePolicy } from '../src/invitation-page.ts'

function browser(url: string, writeText = vi.fn(async (_value: string) => {})) {
  let click: (() => Promise<void>) | undefined
  let hashChange: (() => void) | undefined
  const location = new URL(url)
  const button = { hidden: true, textContent: '复制邀请链接', addEventListener: (_type: string, callback: () => Promise<void>) => { click = callback } }
  const status = { textContent: '请打开同事发来的完整邀请链接，再按下面的步骤加入。' }
  const heading = { textContent: '和同事一起，把工作接着做完' }
  const elements = new Map([['copy', button], ['status', status], ['invitation-state', heading]])
  const script = /<script>([\s\S]*)<\/script>/.exec(teamInvitationPage)?.[1]
  if (script === undefined) throw new Error('invitation script is missing')
  runInNewContext(script, {
    document: { getElementById: (id: string) => elements.get(id) },
    window: { addEventListener: (_type: string, callback: () => void) => { hashChange = callback } },
    location, URLSearchParams, navigator: { clipboard: { writeText } },
  })
  return { button, status, heading, writeText, click: async () => { await click?.() }, script,
    changeHash: (hash: string) => { location.hash = hash; hashChange?.() },
  }
}

const invitation = `https://team.example/shared/#team=project-a&token=${'a'.repeat(43)}`

describe('invitation landing page', () => {
  it('shows a complete invitation and copies its prefix and fragment without redeeming it', async () => {
    const page = browser(invitation)
    expect(page.button.hidden).toBe(false)
    expect(page.heading.textContent).toContain('下一步在你的团队版中加入')
    expect(page.status.textContent).toContain('尚未验证邀请是否过期')
    expect(page.writeText).not.toHaveBeenCalled()
    await page.click()
    expect(page.writeText).toHaveBeenCalledExactlyOnceWith(invitation)
    expect(page.status.textContent).toContain('通过邀请链接加入')
    const hash = createHash('sha256').update(page.script).digest('base64')
    expect(teamInvitationPagePolicy).toContain(`script-src 'sha256-${hash}'`)
  })

  it.each([
    '', '#team=project-a', '#token=short', `#team=project-a&token=${'a'.repeat(43)}&token=${'b'.repeat(43)}`,
    `#team=project-a&token=${'a'.repeat(43)}&extra=1`, `#team=%3Cscript%3E&token=${'a'.repeat(43)}`,
  ])('does not offer to copy an incomplete or malformed invitation %s', (fragment) => {
    const page = browser(`https://team.example/shared/${fragment}`)
    expect(page.button.hidden).toBe(true)
    expect(page.writeText).not.toHaveBeenCalled()
    if (fragment !== '') expect(page.heading.textContent).toBe('邀请链接不完整')
  })

  it('gives manual-copy guidance when browser clipboard access fails', async () => {
    const page = browser(invitation, vi.fn(async () => { throw new Error('clipboard denied') }))
    await page.click()
    expect(page.status.textContent).toContain('手动复制完整链接')
  })

  it('refreshes same-tab invitation changes, clears copied state, and copies only the current complete link', async () => {
    const page = browser(invitation)
    await page.click()
    expect(page.button.textContent).toBe('已复制邀请链接')
    page.changeHash('#team=incomplete')
    expect(page.button.hidden).toBe(true)
    expect(page.heading.textContent).toBe('邀请链接不完整')
    expect(page.button.textContent).toBe('复制邀请链接')
    await page.click()
    expect(page.writeText).toHaveBeenCalledTimes(1)
    const next = `#team=project-b&token=${'b'.repeat(43)}`
    page.changeHash(next)
    expect(page.button.hidden).toBe(false)
    expect(page.status.textContent).toContain('尚未验证邀请是否过期')
    await page.click()
    expect(page.writeText).toHaveBeenLastCalledWith(`https://team.example/shared/${next}`)
    page.changeHash('')
    expect(page.button.hidden).toBe(true)
    expect(page.heading.textContent).toBe('和同事一起，把工作接着做完')
    expect(page.status.textContent).toContain('请打开同事发来的完整邀请链接')
  })

  it.each(['success', 'failure'] as const)('does not overwrite a new invitation with a pending copy %s', async (outcome) => {
    const pending = Promise.withResolvers<undefined>()
    const page = browser(invitation, vi.fn(async () => { await pending.promise }))
    const copying = page.click()
    page.changeHash(`#team=project-b&token=${'b'.repeat(43)}`)
    if (outcome === 'success') pending.resolve(undefined)
    else pending.reject(new Error('clipboard denied'))
    await copying
    expect(page.button.textContent).toBe('复制邀请链接')
    expect(page.status.textContent).toContain('尚未验证邀请是否过期')
  })

  it('offers only the configured HTTPS client page and keeps browser credentials out of the document', () => {
    const page = renderTeamInvitationPage('https://download.example/install?platform=all&version=1')
    expect(page).toContain('href="https://download.example/install?platform=all&amp;version=1"')
    expect(page).toContain('rel="noopener noreferrer"')
    expect(page).not.toContain('dsh-team://')
    expect(page).not.toContain('fetch(')
    expect(page).not.toContain('innerHTML')
    expect(teamInvitationPage).not.toContain('class="download"')
  })

  it.each(['javascript:alert(1)', 'http://download.example', 'https://user:secret@download.example', 'https://download.example/#invite=secret', 'not a url'])('rejects unsafe configured download URLs: %s', (url) => {
    expect(() => renderTeamInvitationPage(url)).toThrow('invitationDownloadUrl')
  })

  it('records the complete newcomer guidance alongside its owning package', async () => {
    await expect(teamInvitationPage).toMatchFileSnapshot('./expected/invitation-page.html')
  })
})
