/** Browser action face shared by the Team Space and optional flight sidecar. */

import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type {
  TeamBattleActorRequest,
  CreateFolderRequest,
  PublishFileRequest,
  UpdateSpaceItemRequest,
  ReadFileRequest,
  SendFileRequest,
  SubmitFileRequest,
  TeamBattleSpaceView,
  TeamBattleFileContent,
  ConsumeWeaponRequest,
  CreateTaskRequest,
  HeartbeatRequest,
  PublishArtifactRequest,
  PublishContextRequest,
  ReviewArtifactRequest,
  TeamBattleView,
  UpdateTaskRequest,
  TeamBattleDirectoryView,
  TeamBattleTeamSummary,
  CreateTeamRequest,
  CreateTeamInviteRequest,
  CreatedTeamInvite,
  JoinRemoteTeamRequest,
  RevokeTeamInviteRequest,
  RevokeTeamMemberRequest,
} from '@deepseek-ai/dsh-experimental-team-battle/client'

/** Generated Team Battle Remote result consumed by both browser surfaces. */
export type TeamBattleResult = RemoteResult<TeamBattleView>

/** Space discovery and membership actions; credentials stay in the local Host. */
export interface TeamJourneyInjected {
  readonly summary: (input: { readonly teamId: TeamBattleTeamSummary['id'] }) => Promise<RemoteResult<TeamBattleTeamSummary>>
  readonly teams: () => Promise<RemoteResult<TeamBattleDirectoryView>>
  readonly createTeam: (input: CreateTeamRequest) => Promise<RemoteResult<TeamBattleTeamSummary>>
  readonly joinRemote: (input: JoinRemoteTeamRequest) => Promise<RemoteResult<TeamBattleTeamSummary>>
  readonly createInvite: (input: CreateTeamInviteRequest) => Promise<RemoteResult<CreatedTeamInvite>>
  readonly revokeInvite: (input: RevokeTeamInviteRequest) => Promise<RemoteResult<unknown>>
  readonly revokeMember: (input: RevokeTeamMemberRequest) => Promise<RemoteResult<unknown>>
}

/** Business actions injected by the browser plugin. */
export interface TeamBattleInjected {
  readonly space: (input?: TeamBattleActorRequest) => Promise<RemoteResult<TeamBattleSpaceView>>
  readonly createFolder: (input: CreateFolderRequest) => Promise<RemoteResult<TeamBattleSpaceView>>
  readonly publishFile: (input: PublishFileRequest) => Promise<RemoteResult<TeamBattleSpaceView>>
  readonly updateSpaceItem: (input: UpdateSpaceItemRequest) => Promise<RemoteResult<TeamBattleSpaceView>>
  readonly readFile: (input: ReadFileRequest) => Promise<RemoteResult<TeamBattleFileContent>>
  readonly sendFile: (input: SendFileRequest) => Promise<RemoteResult<TeamBattleSpaceView>>
  readonly submitFile: (input: SubmitFileRequest) => Promise<TeamBattleResult>
  readonly load: (input?: TeamBattleActorRequest) => Promise<TeamBattleResult>
  readonly createTask: (input: CreateTaskRequest) => Promise<TeamBattleResult>
  readonly updateTask: (input: UpdateTaskRequest) => Promise<TeamBattleResult>
  readonly publishContext: (input: PublishContextRequest) => Promise<TeamBattleResult>
  readonly publishArtifact: (input: PublishArtifactRequest) => Promise<TeamBattleResult>
  readonly reviewArtifact: (input: ReviewArtifactRequest) => Promise<TeamBattleResult>
  readonly consumeWeapon: (input: ConsumeWeaponRequest) => Promise<TeamBattleResult>
  readonly heartbeat: (input: HeartbeatRequest) => Promise<TeamBattleResult>
}

/**
 * Render one transport failure without discarding its machine-readable code.
 * @param error - Remote carrier failure.
 * @returns display-ready message retaining the error code.
 */
export function failureText(error: { readonly code: string; readonly message: string }): string {
  return `${error.message} (${error.code})`
}
