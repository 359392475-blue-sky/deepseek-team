/** Package-owned invariant companion for the durable Team Battle aggregate. */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-experimental-team-battle'

/** Cordis companion plugin name. */
export const name = 'team-battle-invariant'
/** Invariant registry dependency. */
export const inject = ['invariants']

/**
 * No runtime invariant: every durable write validates aggregate ownership,
 * referential integrity, capacity, idempotency, and progress derivation before commit.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's explained empty invariant.
 * @param ctx - Cordis context carrying the invariant registry.
 * @returns the invariant registration disposer.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
