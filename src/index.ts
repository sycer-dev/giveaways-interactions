process.env.NODE_ENV ??= 'development';
import 'reflect-metadata';

import { PrismaClient } from '@prisma/client';
import { APIInteraction, InteractionType } from 'discord-api-types/v9';
import { verifyKey } from 'discord-interactions';
import fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { IncomingMessage, Server, ServerResponse } from 'http';
import { container } from 'tsyringe';
import { handleEnterGiveawayPress } from './buttons/enterGiveaway';
import { REST } from './structures/REST';
import { ButtonIds } from './util/constants';
import { logger } from './util/logger';
import { kCommands, kPrisma, kREST } from './util/symbols';
import Collection from '@discordjs/collection';
import type { Command } from './structures/Command';
import { loadCommands } from './util';
import { populateRedis } from './scripts/populateRedis';

const commands = new Collection<string, Command>();
const prisma = new PrismaClient();
const rest = new REST({ version: '9' }).setToken(process.env.DISCORD_TOKEN!);

container.register(kCommands, { useValue: commands });
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

async function start() {
	await loadCommands(commands);

	const server: FastifyInstance<Server, IncomingMessage, ServerResponse> = fastify({ logger });

	server.get('/interactions', { preHandler: verify }, async (_, res) => res.send(200));

	server.post('/interactions', { preHandler: verify }, async (req, res) => {
		logger.info(`incoming request: `, req.body);
		try {
			const message = req.body as APIInteraction;

			if (message.type === InteractionType.Ping) {
				return res.status(200).header('Content-Type', 'application/json').send({ type: InteractionType.Ping });
			}

			if (message.type === InteractionType.ApplicationCommand) {
				const name = message.data.name;
				const command = commands.get(name);
				if (command) {
					const user = message.user ?? message.member?.user;
					const info = `command "${name}"; triggered by ${user?.username}#${user?.discriminator} (${user?.id})`;
					logger.info(`Executing ${info}`);

					try {
						await command.exec(res, message);
						logger.info(`Successfully executed ${info}`);
					} catch (err) {
						logger.error(`Failed to execute ${info}`, err);
					}
				}
			}

			if (message.type === InteractionType.MessageComponent) {
				const id = message.data.custom_id;
				if (id === ButtonIds.EnterGiveaway) {
					void handleEnterGiveawayPress(res, message);
				}
			}
		} catch {}
	});

	server.listen(process.env.PORT ?? 2399, '0.0.0.0', (err: Error | undefined, adress) => {
		if (err) logger.error('An error occurred starting the server: ', err);
		else logger.info(`Server started at ${adress}`);
	});

	void populateRedis();
}

void start();
