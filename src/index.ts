process.env.NODE_ENV ??= 'development';
import 'reflect-metadata';

import { PrismaClient } from '@prisma/client';
import { APIInteraction, InteractionType } from 'discord-api-types/v9';
import { verifyKey } from 'discord-interactions';
import fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { IncomingMessage, Server, ServerResponse } from 'http';
import { container } from 'tsyringe';
import { handleEnterGiveawayPress } from './buttons/enterGiveaway';
import { invite, create, ping } from './commands';
import { REST } from './structures/REST';
import { ButtonIds } from './util/constants';
import { logger } from './util/logger';
import { kPrisma, kREST } from './util/symbols';

const prisma = new PrismaClient();
const rest = new REST({ version: '9' }).setToken(process.env.DISCORD_TOKEN!);

container.register(kPrisma, { useValue: prisma });
container.register(kREST, { useValue: rest });

function verify(req: FastifyRequest, reply: FastifyReply, done: () => void) {
	const signature = req.headers['x-signature-ed25519'];
	const timestamp = req.headers['x-signature-timestamp'];

	if (!signature || !timestamp) return reply.status(401).send();

	const isValid = verifyKey(
		JSON.stringify(req.body),
		signature as string,
		timestamp as string,
		process.env.DISCORD_PUBKEY!,
	);
	if (!isValid) return reply.status(401).send();

	void done();
}

function start() {
	const server: FastifyInstance<Server, IncomingMessage, ServerResponse> = fastify();

	server.post('/interactions', { preHandler: verify }, async (req, res) => {
		logger.info(`incoming request: `, req.body);
		try {
			const message = req.body as APIInteraction;

			if (message.type === InteractionType.Ping) {
				return res.status(200).header('Content-Type', 'application/json').send({ type: InteractionType.Ping });
			}

			if (message.type === InteractionType.ApplicationCommand) {
				const name = message.data.name;

				if (name === 'create') return create(res, message);
				if (name === 'ping') return ping(res, message);
				if (name === 'invite') return invite(res);
			}

			if (message.type === InteractionType.MessageComponent) {
				const id = message.data.custom_id;
				if (id === ButtonIds.EnterGiveaway) {
					return handleEnterGiveawayPress(res, message);
				}
			}
		} catch {}
	});

	server.listen(process.env.PORT ?? 2399, '0.0.0.0', (err: Error | undefined, adress) => {
		if (err) logger.error('An error occurred starting the server: ', err);
		else logger.info(`Server started at ${adress}`);
	});
}

start();
