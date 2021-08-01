import type { APIMessageComponentInteraction } from 'discord-api-types';
import type { FastifyReply } from 'fastify';
import { createResponse } from '../util/respond';
import { container } from 'tsyringe';
import type { PrismaClient } from '@prisma/client';
import { kPrisma } from '../util/symbols';

export async function handleEnterGiveawayPress(res: FastifyReply, interaction: APIMessageComponentInteraction) {
	const prisma = container.resolve<PrismaClient>(kPrisma);

	const { member, message } = interaction;
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

	if (exists) {
		await prisma.giveaway.update({
			where: { id: giveaway.id },
			data: {
				entries: {
					delete: { id: exists.id },
				},
			},
		});

		return createResponse(
			res,
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

	return createResponse(res, `You've entered this giveaway. Good luck! 🍀`, true);
}
