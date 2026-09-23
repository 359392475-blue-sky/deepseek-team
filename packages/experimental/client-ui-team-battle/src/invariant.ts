/** Package-owned invariant companion for the Team Battle browser presentation. */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-experimental-client-ui-team-battle'

/** Cordis companion plugin name. */
export const name = 'client-ui-team-battle-invariant'
/** Invariant registry dependency. */
export const inject = ['invariants']

// No runtime invariant: authoritative relationships live in the Host service;
// this package owns only disposable slots and non-durable browser game state.
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant ownership.
 * @param ctx - Cordis Context carrying the invariant registry.
 * @returns disposer for the package registration.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
