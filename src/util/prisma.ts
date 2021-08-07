import type { GiveawayEntry, PrismaClient } from '@prisma/client';

export const queryWinners = (prisma: PrismaClient, giveawayId: string, winners: number) => {
	return prisma.$queryRaw<GiveawayEntry[]>(
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
		giveawayId,
		winners,
	);
};
