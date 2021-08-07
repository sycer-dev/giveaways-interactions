import { bold, inlineCode, SlashCommandBuilder, time, TimestampStyles, userMention } from '@discordjs/builders';
import type { RESTPostAPIChannelMessageResult } from '@discordjs/builders/node_modules/discord-api-types';
import ms from '@naval-base/ms';
import type { PrismaClient } from '@prisma/client';
import { mergeDefault } from '@sapphire/utilities';
import { stripIndents } from 'common-tags';
import { isApplicationCommandGuildInteraction } from 'discord-api-types/utils/v9';
import {
	APIActionRowComponent,
	APIApplicationCommandInteraction,
	APIApplicationCommandInteractionData,
	APIEmbed,
	APIInteraction,
	ButtonStyle,
	ComponentType,
	RESTPostAPIChannelMessageJSONBody,
	Routes,
} from 'discord-api-types/v9';
import type { FastifyReply } from 'fastify';
import { container } from 'tsyringe';
import type { Command } from '../structures/Command';
import { GiveawayHandler } from '../structures/GiveawayHandler';
import type { REST } from '../structures/REST';
import { createMessageLink, pluralize, transformEmojiString } from '../util';
import { ButtonIds, Colors } from '../util/constants';
import { logger } from '../util/logger';
import { createResponse, defer, sendFollowup } from '../util/respond';
import { kPrisma, kREST } from '../util/symbols';

interface TraditionalGiveawayArguments {
	winners?: number;
	emoji?: string;
	duration: string;
	title: string;
}

const argumentDefaults: Partial<TraditionalGiveawayArguments> = {
	winners: 1,
	emoji: '🎉',
};

export default class implements Command {
	public readonly builder = new SlashCommandBuilder()
		.setName('create')
		.setDescription('Creates a giveaway in the current channel.')
		.addStringOption((opt) => opt.setName('title').setDescription('The title of the giveaway').setRequired(true))
		.addStringOption((opt) =>
			opt
				.setName('duration')
				.setDescription('How long the giveaway should last (example: `5 minutes`, `3 days`, `1d`)')
				.setRequired(true),
		)
		.addStringOption((opt) =>
			opt
				.setName('emoji')
				.setDescription('The emoji on the button the users press to enter the giveaway (default: 🎉)'),
		)
		.addIntegerOption((opt) =>
			opt.setName('winners').setDescription('The amount of winners the giveaway should have (default: 1)'),
		);

	public async exec(res: FastifyReply, interaction: APIInteraction): Promise<void> {
		const prisma = container.resolve<PrismaClient>(kPrisma);
		const rest = container.resolve<REST>(kREST);
		const giveawayHandler = container.resolve(GiveawayHandler);

		try {
			if (!isApplicationCommandGuildInteraction(interaction as APIApplicationCommandInteraction))
				return createResponse(res, 'This command can only be ran within a server!', true);

			const { data } = interaction as { data: APIApplicationCommandInteractionData };

			const args = mergeDefault(
				argumentDefaults,
				Object.fromEntries(
					// @ts-expect-error
					data.options.map(({ name, value }: { name: string; value: any }) => [name, value]),
				) as TraditionalGiveawayArguments,
			);

			if (args.title.length > 64)
				return createResponse(res, "The title of the giveaway can't be over 64 characters!", true);

			const parsedDuration = ms(args.duration);
			if (isNaN(parsedDuration) || parsedDuration === 0)
				return createResponse(
					res,
					`The giveaway duration you provided of "${args.duration}" is invalid! Please try again.`,
					true,
				);

			if (parsedDuration < 5000)
				return createResponse(res, "I'm sorry, you giveaway must be more than five seconds long!", true);

			const drawAt = new Date(Date.now() + parsedDuration);

			const mention = userMention(interaction.member!.user.id);
			const tag = `${interaction.member?.user.username}#${interaction.member?.user.discriminator}`;
			const embed: APIEmbed = {
				color: Colors.Primary,
				title: args.title,
				description: stripIndents`
				• Drawing ${time(drawAt, TimestampStyles.RelativeTime)} (${time(drawAt, TimestampStyles.ShortDateTime)})
				• Hosted by ${mention} (${inlineCode(tag)})
				• ${inlineCode(args.winners.toString())} possible winner${pluralize(args.winners)}
			`,
			};

			const emoji = args.emoji.length <= 3 ? { name: args.emoji } : transformEmojiString(args.emoji);
			if (emoji === null) return createResponse(res, 'The emoji you provided is invalid! Please try again.', true);

			void defer(res);

			const components: APIActionRowComponent[] = [
				{
					type: ComponentType.ActionRow,
					components: [
						{
							type: ComponentType.Button,
							style: ButtonStyle.Primary,
							custom_id: ButtonIds.EnterGiveaway,
							label: 'Enter Giveaway',
							// @ts-ignore
							emoji,
						},
					],
				},
			];

			const body: RESTPostAPIChannelMessageJSONBody = {
				content: bold('🎉 **Giveaway** 🎉'),
				embeds: [embed],
				components,
			};

			const resp = (await rest.post(Routes.channelMessages(interaction.channel_id!), {
				body,
			})) as RESTPostAPIChannelMessageResult;

			const row = await prisma.giveaway.create({
				data: {
					title: args.title,
					emoji: args.emoji,
					message_id: resp.id,
					channel_id: resp.channel_id,
					draw_at: drawAt,
					duration: parsedDuration,
					winners: args.winners,
					created_by: interaction.member!.user.id,
					guild: {
						connectOrCreate: {
							create: {
								id: interaction.guild_id!,
							},
							where: {
								id: interaction.guild_id!,
							},
						},
					},
				},
			});

			giveawayHandler.giveawayQueue.add({ id: row.id }, { delay: parsedDuration });

			await sendFollowup(
				process.env.DISCORD_CLIENT_ID!,
				interaction.token,
				`Giveaway created! You can check it out [here](<${createMessageLink(
					resp.guild_id!,
					resp.channel_id,
					resp.id,
				)}>)!`,
				true,
			);
		} catch (err) {
			logger.error(err);
		}
	}
}
