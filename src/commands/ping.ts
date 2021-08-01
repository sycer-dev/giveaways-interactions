import { SlashCommandBuilder } from '@discordjs/builders';
import type { APIApplicationCommandInteraction } from 'discord-api-types';
import type { FastifyReply } from 'fastify';
import { pingEasterEggResponses, pingResponses } from '../util/constants';
import { logger } from '../util/logger';
import { createResponse } from '../util/respond';

export const pingJSON = new SlashCommandBuilder()
	.setName('ping')
	.setDescription('Ensures the bot is responding to commands.')
	.toJSON();

const again = new Map<string, NodeJS.Timeout>();

export async function ping(res: FastifyReply, interaction: APIApplicationCommandInteraction) {
	try {
		const userId = interaction.user?.id ?? interaction.member!.user.id;

		const d = () =>
			(() => {
				const entry = again.get(userId);
				if (entry) {
					clearTimeout(entry);
					again.delete(userId);
				}

				return pingEasterEggResponses;
			})();

		const set = again.has(userId) ? d() : pingResponses;
		const response = set[Math.floor(Math.random() * set.length)];

		// little easter egg :)
		if (response === 'Do it again. I dare you.') {
			// 5 seconds to do it again
			const timeout = setTimeout(() => again.delete(userId), 5000);
			again.set(userId, timeout);
		}

		return createResponse(res, response, true);
	} catch (err) {
		logger.error(err);
	}
}
