import type { SlashCommandBuilder } from '@discordjs/builders';
import type { APIInteraction } from 'discord-api-types';
import type { FastifyReply } from 'fastify';

export interface Command {
	readonly builder: SlashCommandBuilder | Omit<SlashCommandBuilder, 'addSubcommand' | 'addSubcommandGroup'>;

	exec(res: FastifyReply, interaction: APIInteraction): unknown | Promise<unknown>;
}
