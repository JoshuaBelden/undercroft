/**
 * Parties: the group that descends together. The server owns them (server/parties.ts) and sends
 * every member the whole `PartyState` whenever it changes. See docs/dev/expedition.md.
 */

export interface PartyMember {
	/** Stable for the connection; not the same as the player id inside an expedition. */
	id: string;
	/** Their account id: what friends are listed by. */
	account: string;
	name: string;
	/** Has confirmed their loadout and is waiting to descend. */
	ready: boolean;
	/** Down in the catacombs right now (false once they have climbed out or died). */
	inExpedition: boolean;
	/** False while their connection is down and their place is being held. */
	connected: boolean;
}

export interface PartyState {
	/** Member id of the host, who chooses the Affliction. */
	leader: string;
	members: PartyMember[];
	/** The Affliction the host chose (key into AFFLICTIONS); null until they choose. */
	affliction: string | null;
	/** An expedition is under way; nobody can descend until everyone in it is out. */
	expedition: boolean;
	/**
	 * Everyone is ready and the descent is counting down: milliseconds left when this was sent.
	 * Null otherwise.
	 */
	launchIn: number | null;
}

/**
 * Whether the party is about to descend: an Affliction is chosen, nobody is underground, and
 * everyone is here and ready.
 */
export function allReady(party: PartyState): boolean {
	if (party.expedition || !party.affliction || party.members.length === 0) return false;
	return party.members.every((member) => member.ready && member.connected);
}
