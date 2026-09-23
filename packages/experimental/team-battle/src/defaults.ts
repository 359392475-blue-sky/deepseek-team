/** Shared deployment defaults used by schema parsing and direct service construction. */

/** Default legacy roster, retention, combat, and presence limits. */
export const defaults = {
  max_members: 8,
  max_tasks: 256,
  max_contexts: 512,
  max_artifacts: 512,
  max_activity: 512,
  max_processed_event_ids: 4096,
  max_weapon_grants: 4096,
  combat_shield_max: 100,
  query_shield_damage: 2,
  member_offline_after_ms: 60_000,
} as const
