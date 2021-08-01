import Bull from 'bull';
import { logger as _logger } from '../util/logger';
import { GiveawayEntry, GiveawayStatus, PrismaClient } from '@prisma/client';
import type { APIEmbed } from 'discord-api-types';
import { Colors } from '../util/constants';
import { stripIndents } from 'common-tags';
import { inlineCode, time, TimestampStyles, userMention } from '@discordjs/builders';
import { pluralize } from '../util';
import { inject, injectable } from 'tsyringe';
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
		const winners = await this.prisma.$queryRaw<GiveawayEntry[]>(
			`
			SELECT *
			FROM   "entries" AS rawentries
				JOIN (SELECT id
						FROM   "entries"
						WHERE  giveaway_id = $1
						ORDER  BY Random()
						LIMIT  $2) AS entries
					ON rawentries.id = entries.id;
		`,
			giveaway.id,
			giveaway.winners,
		);

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

		const host = await this.rest.fetchUser(giveaway.created_by);

		// @ts-expect-error
		const mention = userMention(giveaway.created_by);
		const tag = `${host.username}#${host.discriminator}`;
		const relativeTime = time(giveaway.draw_at, TimestampStyles.RelativeTime);
		const shortTime = time(giveaway.draw_at, TimestampStyles.ShortDateTime);
		// @ts-expect-error
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

		// update our old message
		await this.rest.updateMessage(giveaway.channel_id, giveaway.message_id, {
			content: '🎉 **GIVEAWAY ENDED** 🎉',
			components: [],
			embeds: [embed],
		});

		// send new message so users know they won
		await this.rest.sendMessage(giveaway.channel_id, {
			content: `🎉 Congratulations, ${winnerMentions.join(', ').substring(0, 1500)}! You won the giveaway for *${
				giveaway.title
			}*!`,
		});

		return true;
	}
}
