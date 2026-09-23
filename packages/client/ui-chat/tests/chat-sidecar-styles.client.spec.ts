/** Sidecar layout declarations that jsdom cannot resolve through `:has()`. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(
  fileURLToPath(new URL('../src/client/chat/ChatView.module.css', import.meta.url)),
  'utf8',
)

describe('Chat sidecar layout', () => {
  it('gates the desktop split on an occupied slot anchor', () => {
    expect(css).toContain(".root:has(> [data-slot='conversation.chat.sidecar'] > *)")
    expect(css).toContain('minmax(0, var(--dsh-chat-sidecar-transcript-share, 42%))')
    expect(css).toContain('minmax(0, 1fr)')
    expect(css).toContain('var(--dsh-conversation-viewport-height, 100dvh)')
    expect(css).toContain('- var(--dsh-composer-height, 152px)')
  })

  it('stacks the sidecar below the transcript at the narrow breakpoint', () => {
    const narrow = css.slice(css.indexOf('@media (max-width: 900px)'))
    expect(narrow).toContain('grid-template-columns: minmax(0, 1fr)')
    expect(narrow).toContain('grid-row: 2')
    expect(narrow).toContain('position: static')
  })
})
