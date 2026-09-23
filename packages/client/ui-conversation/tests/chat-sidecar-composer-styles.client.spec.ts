/** Composer declarations selected by an occupied Chat sidecar anchor. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(
  fileURLToPath(new URL('../src/client/skeleton/ConversationRoot.module.css', import.meta.url)),
  'utf8',
)

describe('Chat sidecar composer layout', () => {
  it('keeps the composer in the transcript column only while the sidecar is occupied', () => {
    expect(css).toContain(
      "[data-conversation-chat-sidecar] > [data-slot='conversation.chat.sidecar'] > *",
    )
    expect(css).toContain('--dsh-chat-sidecar-transcript-share: 42%')
    expect(css).toMatch(
      /\) > \.composerSeat \{\s*width: var\(--dsh-chat-sidecar-transcript-share\);\s*\}/,
    )
  })

  it('restores the full-width composer under the stacking breakpoint', () => {
    const narrow = css.slice(css.indexOf('@media (max-width: 900px)'))
    expect(narrow).toMatch(/\) > \.composerSeat \{\s*width: 100%;\s*\}/)
  })
})
