import type Collection from '@discordjs/collection';
import type { APIPartialEmoji } from 'discord-api-types';
import { scan } from 'fs-nextra';
import { extname, join } from 'path';
import { container } from 'tsyringe';
import type { Command } from '../structures/Command';
import { logger } from './logger';

export function transformEmojiString(emoji: string): APIPartialEmoji | null {
	const regex = /<?(?<animated>a)?:?(?<name>\w{2,32}):(?<id>\d{17,19})>?/;
	const exec = regex.exec(emoji);
	if (!exec) return null;

	const {
		groups: { name, id, animated },
	} = exec as RegExpExecArray & { groups: Record<'name' | 'id', string> & { animated?: string } };

	return {
		name,
		id,
		animated: animated ? true : false,
	};
}

export function createMessageLink(...[guildId, channelId, messageId]: string[]): string {
	return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}

export function pluralize(number: number, suffix = 's'): string {
	if (number === 1) return '';
	return suffix;
}

export function localize(number: number, locale = 'en-US'): string {
	try {
		return new Intl.NumberFormat(locale).format(number);
	} catch {}
	return new Intl.NumberFormat('en-US').format(number);
}

export function list(arr: string[], conj = 'and'): string {
	const len = arr.length;
	if (len === 0) return '';
	if (len === 1) return arr[0];

	return `${arr.slice(0, -1).join(', ')}${len > 1 ? `${len > 2 ? ',' : ''} ${conj} ` : ''}${arr.slice(-1)}`;
}

export async function loadCommands(commandStore: Collection<string, Command>) {
	const files = (
		await scan(join(__dirname, '..', 'commands'), {
			filter: (stats) => stats.isFile() && ['.js', '.ts'].includes(extname(stats.name)),
		})
	).keys();

	logger.info(files);

	for (const file of files) {
		const command = container.resolve<Command>((await import(file)).default);
		commandStore.set(command.builder.name, command);
		logger.info(`Successfully loaded command "${command.builder.name}"!`);
	}
}
