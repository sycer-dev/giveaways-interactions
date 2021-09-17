import { SlashCommandBuilder, hideLinkEmbed, hyperlink } from '@discordjs/builders';
import type { FastifyReply } from 'fastify';
import { URLSearchParams } from 'url';
import type { Command } from '../structures/Command';
import { logger } from '../util/logger';
import { createResponse } from '../util/respond';

export default class implements Command {
	public readonly builder = new SlashCommandBuilder()
		.setName('invite')
		.setDescription('Returns an invite link to add Giveaways to your server.');

	public async exec(res: FastifyReply): Promise<void> {
		try {
			const query = new URLSearchParams();
			query.set('client_id', process.env.DISCORD_CLIENT_ID!);
			query.set('scope', 'bot applications.commands');
			const link = `https://discord.com/oauth2/authorize?${query}`;

			return createResponse(
				res,
				`Want to add Giveaways to your server? ${hyperlink('Click here', hideLinkEmbed(link))}!`,
				true,
			);
		} catch (err) {
			logger.error(err);
		}
	}
}
