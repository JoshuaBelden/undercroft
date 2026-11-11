/**
 * Parties: the group that descends together. The server owns them (server/parties.ts) and sends
 * every member the whole `PartyState` whenever it changes. See docs/dev/expedition.md.
 */

export interface PartyMember {
	/** Stable for the connection; not the same as the player id inside an expedition. */
	id: string;
	name: string;
	ready: boolean;
	/** Down in the catacombs right now (false once they have climbed out or died). */
	inExpedition: boolean;
	/** False while their connection is down and their place underground is being held. */
	connected: boolean;
}

export interface PartyState {
	/** Invite code: anyone who enters it joins this party. */
	code: string;
	/** Member id of the leader, who starts the descent. */
	leader: string;
	members: PartyMember[];
	/** An expedition is under way; nobody can descend until everyone in it is out. */
	expedition: boolean;
}

/** An invite code as typed or pasted, tidied for lookup. */
export function normalizeCode(raw: string): string {
	return raw.replace(/[^a-z0-9]/gi, '').toUpperCase();
}

/** Whether the leader can start the descent: nobody is underground and everyone else is ready. */
export function canDescend(party: PartyState): boolean {
	if (party.expedition) return false;
	return party.members.every((member) => member.ready || member.id === party.leader);
}
