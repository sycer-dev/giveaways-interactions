import { inlineCode, SlashCommandBuilder, userMention } from '@discordjs/builders';
import type { PrismaClient } from '@prisma/client';
import { mergeDefault } from '@sapphire/utilities';
import { isApplicationCommandGuildInteraction } from 'discord-api-types/utils/v9';
import type {
	APIApplicationCommandInteraction,
	APIApplicationCommandInteractionData,
	APIInteraction,
} from 'discord-api-types/v9';
import type { FastifyReply } from 'fastify';
import { container } from 'tsyringe';
import type { Command } from '../structures/Command';
import { list } from '../util';
import { logger } from '../util/logger';
import { queryWinners } from '../util/prisma';
import { createResponse } from '../util/respond';
import { kPrisma } from '../util/symbols';

interface RerollArguments {
	message_id: string;
	winners?: number;
}

const argumentDefaults: Partial<RerollArguments> = {
	winners: 1,
};

export default class implements Command {
	public readonly builder = new SlashCommandBuilder()
		.setName('reroll')
		.setDescription('Rerolls an ended ended giveaway')
		.addStringOption((opt) =>
			opt.setName('message_id').setDescription('The message id of the giveaway to reroll').setRequired(true),
		)
		.addIntegerOption((opt) => opt.setName('winners').setDescription('The amount of winners to draw (default: 1)'));

	public async exec(res: FastifyReply, interaction: APIInteraction): Promise<void> {
		const prisma = container.resolve<PrismaClient>(kPrisma);

		try {
			if (!isApplicationCommandGuildInteraction(interaction as APIApplicationCommandInteraction))
				return createResponse(res, 'This command can only be ran within a server!', true);

			const { data } = interaction as { data: APIApplicationCommandInteractionData };

			const { message_id, winners: winnerAmount } = mergeDefault(
				argumentDefaults,
				Object.fromEntries(
					// @ts-expect-error
					data.options.map(({ name, value }: { name: string; value: any }) => [name, value]),
				) as RerollArguments,
			);

			const row = await prisma.giveaway.findFirst({ where: { message_id } });
			if (!row) {
				return createResponse(res, `Couldn't find a giveaway with the message id ${inlineCode(message_id)}`, true);
			}

			const winners = await queryWinners(prisma, row.id, winnerAmount);

			// update the entries so we know they were winning entries
			await prisma.giveawayEntry.updateMany({
				where: {
					id: {
						in: winners.map((w) => w.id),
					},
				},
				data: {
					winner: true,
				},
			});

			const winnerMentions = winners.map((w) => userMention(w.user_id));

			return createResponse(
				res,
				`🎲 Congratulations, ${list(winnerMentions)}! You won the giveaway for *${row.title}* on a reroll!`,
				false,
				{ users: winners.map((w) => w.user_id) },
			);
		} catch (err) {
			logger.error(err);
		}
	}
}
