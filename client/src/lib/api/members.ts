import { api, scopePath, type OrgRef, type SiteRef } from './client';
import type { components } from './schema.gen';

type Schemas = components['schemas'];

export type Member = Schemas['Member'];
export type Invitation = Schemas['Invitation'];
export type PasswordResetLink = Schemas['PasswordReset'];

/**
 * A site's accounts and invitations; with the organization alone, every account
 * of the organization, and the invitations of its supervisors.
 */
export type MembersScope = SiteRef | OrgRef;

export interface MemberChanges {
  /** A site's accounts only. */
  role?: Member['role'];
  is_active?: boolean;
}

const PAGE_SIZE = 200;

function membersPath(scope: MembersScope, id?: number): string {
  return `${scopePath(scope)}/members${id === undefined ? '' : `/${id}`}`;
}

export const membersApi = {
  list: async (scope: MembersScope): Promise<Member[]> => {
    const members: Member[] = [];
    for (let page = 1; ; page += 1) {
      const { items, total_count } = (
        await api.get(membersPath(scope), { params: { page, per_page: PAGE_SIZE } })
      ).data;
      members.push(...items);
      if (items.length === 0 || members.length >= total_count) return members;
    }
  },

  update: async (scope: MembersScope, id: number, changes: MemberChanges): Promise<Member> =>
    (await api.patch(membersPath(scope, id), changes)).data,

  remove: async (scope: MembersScope, id: number): Promise<void> => {
    await api.delete(membersPath(scope, id));
  },

  resetSecondFactors: async (scope: MembersScope, id: number): Promise<void> => {
    await api.delete(`${membersPath(scope, id)}/second-factors`);
  },

  sendPasswordReset: async (scope: MembersScope, id: number): Promise<PasswordResetLink> =>
    (await api.post(`${membersPath(scope, id)}/password-reset`)).data,
};

export const invitationsApi = {
  list: async (scope: MembersScope): Promise<Invitation[]> =>
    (await api.get(`${scopePath(scope)}/invitations`)).data.items,

  /** `role` for a site's invitation; a supervisor's names none. */
  create: async (
    scope: MembersScope,
    invitation: { role?: Member['role']; email?: string }
  ): Promise<Invitation> =>
    (
      await api.post(`${scopePath(scope)}/invitations`, {
        ...invitation,
        send_email: Boolean(invitation.email),
      })
    ).data,

  revoke: async (scope: MembersScope, id: number): Promise<void> => {
    await api.delete(`${scopePath(scope)}/invitations/${id}`);
  },
};
