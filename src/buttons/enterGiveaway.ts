import type { APIMessageComponentInteraction } from 'discord-api-types';
import type { FastifyReply } from 'fastify';
import { defer, sendFollowup } from '../util/respond';
import { container } from 'tsyringe';
import type { PrismaClient } from '@prisma/client';
import { kPrisma } from '../util/symbols';

export async function handleEnterGiveawayPress(res: FastifyReply, interaction: APIMessageComponentInteraction) {
	// do some defering to avoid spam
	await defer(res);

	const prisma = container.resolve<PrismaClient>(kPrisma);

	const { member, message, application_id, token } = interaction;
	const { user } = member!;

	const giveaway = (await prisma.giveaway.findFirst({
		where: {
			message_id: message.id,
		},
	}))!;

	const exists = await prisma.giveawayEntry.findFirst({
		where: {
			user_id: user.id,
			giveaway: {
				id: giveaway.id,
			},
		},
	});

	// start by defering button for three seconds to reduce spam
	await new Promise((r) => setTimeout(r, 3000));

	if (exists) {
		await prisma.giveaway.update({
			where: { id: giveaway.id },
			data: {
				entries: {
					delete: { id: exists.id },
				},
			},
		});

		return sendFollowup(
			application_id,
			token,
			`You've been removed from this giveaway! If you want to re-enter, re-click the entry button!`,
			true,
		);
	}

	await prisma.giveaway.update({
		where: { id: giveaway.id },
		data: {
			entries: {
				create: {
					user_id: user.id,
				},
			},
		},
	});

	return sendFollowup(application_id, token, `You've entered this giveaway. Good luck! 🍀`, true);
}
