import { SlashCommandBuilder } from '@discordjs/builders';
import type { APIApplicationCommandInteraction } from 'discord-api-types';
import type { FastifyReply } from 'fastify';
import type { Command } from '../structures/Command';
import { pingEasterEggResponses, pingResponses } from '../util/constants';
import { logger } from '../util/logger';
import { createResponse } from '../util/respond';

export default class implements Command {
	public readonly again = new Map<string, NodeJS.Timeout>();

	public readonly builder = new SlashCommandBuilder()
		.setName('ping')
		.setDescription('Ensures the bot is responding to commands.');

	public async exec(res: FastifyReply, interaction: APIApplicationCommandInteraction): Promise<void> {
		try {
			const userId = interaction.user?.id ?? interaction.member!.user.id;

			const d = () =>
				(() => {
					const entry = this.again.get(userId);
					if (entry) {
						clearTimeout(entry);
						this.again.delete(userId);
					}

					return pingEasterEggResponses;
				})();

			const set = this.again.has(userId) ? d() : pingResponses;
			const response = set[Math.floor(Math.random() * set.length)];

			// little easter egg :)
			if (response === 'Do it again. I dare you.') {
				// 5 seconds to do it again
				const timeout = setTimeout(() => this.again.delete(userId), 5000);
				this.again.set(userId, timeout);
			}

			return createResponse(res, response, true);
		} catch (err) {
			logger.error(err);
		}
	}
}
