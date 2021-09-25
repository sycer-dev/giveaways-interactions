import { inlineCode, time, TimestampStyles, userMention } from '@discordjs/builders';
import { GiveawayStatus, PrismaClient } from '@prisma/client';
import Bull from 'bull';
import { stripIndents } from 'common-tags';
import type { APIEmbed } from 'discord-api-types';
import { inject, injectable } from 'tsyringe';
import { list, pluralize } from '../util';
import { Colors } from '../util/constants';
import { logger as _logger } from '../util/logger';
import { queryWinners } from '../util/prisma';
import { kPrisma, kREST } from '../util/symbols';
import type { REST } from './REST';

export interface GiveawayJobData {
	id: string;
}

@injectable()
export class GiveawayHandler {
	public readonly giveawayQueue = new Bull<GiveawayJobData>('giveawayQueue', process.env.REDIS_URL!);

	private readonly logger = _logger.child({ module: this.constructor.name });

	public constructor(@inject(kPrisma) public readonly prisma: PrismaClient, @inject(kREST) public readonly rest: REST) {
		this.giveawayQueue.on('waiting', (id) => this.logger.debug(`[Giveaway Worker]: ${id} is waiting!`));
		this.giveawayQueue.on('active', ({ id }) => this.logger.debug(`[Giveaway Worker]: ${id} has started!`));
		this.giveawayQueue.on('stalled', ({ id }) => this.logger.debug(`[Giveaway Worker]: ${id} has stalled!`));
		this.giveawayQueue.on('completed', ({ id }) => this.logger.debug(`[Giveaway Worker]: ${id} has completed!`));
		this.giveawayQueue.on('failed', ({ id }, err) => this.logger.debug(`[Giveaway Worker]: ${id} failed!`, err));
		this.giveawayQueue.on('cleaned', (jobs) =>
			this.logger.debug(
				`[Giveaway Worker]: ${jobs.length} jobs have been cleaned (${jobs.map((j) => j.id).join(', ')})!`,
			),
		);

		this.giveawayQueue.process(async (job, done) => {
			try {
				await this.drawGiveaway(job.data);
				done();
			} catch (err) {
				this.logger.error(`Error processing giveaway: ${err}`);
			}
		});
	}

	private async drawGiveaway(data: GiveawayJobData): Promise<boolean> {
		const giveaway = (await this.prisma.giveaway.findFirst({
			where: {
				id: data.id,
			},
		}))!;

		// fetch the giveaway message
		const message = await this.rest.fetchGuildMessage(giveaway.channel_id, giveaway.message_id).catch(() => null);

		if (!message) {
			// set giveaway to CANCELLED, assume the message was deleted
			await this.prisma.giveaway.update({
				where: {
					id: giveaway.id,
				},
				data: {
					status: GiveawayStatus.CANCELLED,
				},
			});

			return true;
		}

		// set giveaway to DRAWN
		await this.prisma.giveaway.update({
			where: {
				id: giveaway.id,
			},
			data: {
				status: GiveawayStatus.DRAWN,
			},
		});

		// query our winning entries
		const winners = await queryWinners(this.prisma, giveaway.id, giveaway.winners);

		const host = await this.rest.fetchUser(giveaway.created_by);
		const mention = userMention(giveaway.created_by);
		const tag = `${host.username}#${host.discriminator}`;
		const relativeTime = time(giveaway.draw_at, TimestampStyles.RelativeTime);
		const shortTime = time(giveaway.draw_at, TimestampStyles.ShortDateTime);

		if (!winners.length) {
			// update old message
			const embed: APIEmbed = {
				title: giveaway.title,
				color: Colors.GiveawayOver,
				description: stripIndents`
					This giveaway has ended!
	
					There were no winners.
	
					• Drew ${relativeTime} (${shortTime})
					• Hosted by ${mention} (${inlineCode(tag)})
				`,
			};
			if (giveaway.image) Reflect.set(embed, 'thumbnail', { url: giveaway.image });

			// update our old message
			await this.rest.updateMessage(giveaway.channel_id, giveaway.message_id, {
				content: '🎉 **GIVEAWAY ENDED** 🎉',
				components: [],
				embeds: [embed],
			});

			// send new message so users know they won
			await this.rest.sendMessage(giveaway.channel_id, {
				content: `😟 There were no winners for the giveaway *${giveaway.title}*!`,
				allowed_mentions: {
					users: winners.map((w) => w.user_id),
				},
			});

			return true;
		}

		const winnerMentions = winners.map((w) => userMention(w.user_id));
		const embed: APIEmbed = {
			title: giveaway.title,
			color: Colors.GiveawayOver,
			description: stripIndents`
				This giveaway has ended!

				Winners:
				${winnerMentions.join(', ')}

				• Drew ${relativeTime} (${shortTime})
				• ${inlineCode(giveaway.winners.toString())} winner${pluralize(giveaway.winners)}
				• Hosted by ${mention} (${inlineCode(tag)})
			`,
		};
		if (giveaway.image) Reflect.set(embed, 'thumbnail', { url: giveaway.image });

		// update the entries so we know they were winning entries
		await this.prisma.giveawayEntry.updateMany({
			where: {
				id: {
					in: winners.map((w) => w.id),
				},
			},
			data: {
				winner: true,
			},
		});

		// update our old message
		await this.rest.updateMessage(giveaway.channel_id, giveaway.message_id, {
			content: '🎉 **GIVEAWAY ENDED** 🎉',
			components: [],
			embeds: [embed],
		});

		// send new message so users know they won
		await this.rest.sendMessage(giveaway.channel_id, {
			content: `🎉 Congratulations, ${list(winnerMentions)}! You won the giveaway for *${giveaway.title}*!`,
			allowed_mentions: {
				users: winners.map((w) => w.user_id),
			},
		});

		return true;
	}
}
