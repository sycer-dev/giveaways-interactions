import {
	AllowedMentionsTypes,
	APIActionRowComponent,
	APIEmbed,
	APIInteractionResponseChannelMessageWithSource,
	APIInteractionResponseDeferredChannelMessageWithSource,
	InteractionResponseType,
	RESTPatchAPIWebhookWithTokenMessageResult,
	Routes,
} from 'discord-api-types/v9';
import type { FastifyReply } from 'fastify';
import { container } from 'tsyringe';
import type { REST } from '../structures/REST';
import { kREST } from './symbols';

export function createResponse(
	res: FastifyReply,
	content: string,
	ephemeral = false,
	{
		components,
		embeds,
		users,
		parse,
	}: {
		components?: APIActionRowComponent[];
		embeds?: APIEmbed[];
		users?: string[];
		parse?: AllowedMentionsTypes[];
	} = {},
) {
	return res.status(200).send({
		type: InteractionResponseType.ChannelMessageWithSource,
		data: {
			components,
			content,
			embeds,
			flags: ephemeral ? 64 : 0,
			allowed_mentions: { parse, users },
		},
	} as APIInteractionResponseChannelMessageWithSource);
}

export async function sendFollowup(
	applicationId: string,
	interactionToken: string,
	content: string,
	ephemeral = false,
	{
		components,
		embeds,
		users,
		parse,
	}: {
		components?: APIActionRowComponent[];
		embeds?: APIEmbed[];
		users?: string[];
		parse?: AllowedMentionsTypes[];
	} = {},
) {
	const rest = container.resolve<REST>(kREST);
	return (await rest.patch(Routes.webhookMessage(applicationId, interactionToken, '@original'), {
		body: {
			components,
			content,
			embeds,
			flags: ephemeral ? 64 : 0,
			allowed_mentions: { parse, users },
		},
	})) as RESTPatchAPIWebhookWithTokenMessageResult;
}

export function defer(res: FastifyReply) {
	return res.status(200).send({
		type: InteractionResponseType.DeferredChannelMessageWithSource,
		data: {
			flags: 64,
		},
	} as APIInteractionResponseDeferredChannelMessageWithSource);
}
