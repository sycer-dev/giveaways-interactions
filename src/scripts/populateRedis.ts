import { GiveawayStatus, PrismaClient } from '.prisma/client';
import { container } from 'tsyringe';
import { GiveawayHandler } from '../structures/GiveawayHandler';
import { kPrisma } from '../util/symbols';

export async function populateRedis(): Promise<boolean> {
	const prisma = container.resolve<PrismaClient>(kPrisma);
	const giveawayHandler = container.resolve(GiveawayHandler);

	const activeGiveaways = await prisma.giveaway.findMany({ where: { status: GiveawayStatus.IN_PROGRESS } });
	const activeJobs = await giveawayHandler.giveawayQueue.getDelayed();

	for (const giveaway of activeGiveaways) {
		const exists = activeJobs.find((j) => j.data.id === giveaway.id);
		if (exists) continue;

		const delay = giveaway.draw_at.getTime() - Date.now();
		// if the giveaway is past draw time
		if (delay < 0) {
			await giveawayHandler.giveawayQueue.add({ id: giveaway.id });
		} else await giveawayHandler.giveawayQueue.add({ id: giveaway.id }, { delay });
	}

	return true;
}
