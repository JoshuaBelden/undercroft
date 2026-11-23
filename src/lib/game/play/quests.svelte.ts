import type { ServerMessage } from '#lib/shared/protocol.ts';
import type { QuestBrief } from '#lib/shared/quests/types.ts';
import type { PlayFeature } from './feature.ts';

/**
 * Quests below (docs/dev/quests.md): your open quests for the HUD's quest panel, and the recipes
 * quests have taught you (the Craft tab), as the server last said.
 */
export class Quests implements PlayFeature {
	briefs = $state<QuestBrief[]>([]);
	learned = $state<string[]>([]);

	message(message: ServerMessage): void {
		if (message.type !== 'quests') return;
		this.briefs = message.quests;
		this.learned = message.learned;
	}

	clear(): void {
		this.briefs = [];
		this.learned = [];
	}
}
