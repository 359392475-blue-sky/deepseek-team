/** Package-owned invariant companion for the static Team Battle profile. */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-experimental-team-battle-profile'

/** Cordis companion plugin name. */
export const name = 'team-battle-profile-invariant'
/** Service required before the companion can register. */
export const inject = ['invariants']

// No runtime invariant: the bundle carries only static composition; runtime
// relationships belong to the Team Battle domain and connector packages.
const install: InvariantInstaller = () => {}

/**
 * Register the package's empty static-bundle companion.
 * @param ctx - Cordis Context carrying the invariant registry.
 * @returns the registration disposer after setup.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
