//@ts-check
const Scene = require('node-vk-bot-api/lib/scene'),
	{ createDefaultMenu, createDefaultKeyboard } = require('../utils/messagePayloading.js'),
	botCommands = require('../utils/botCommands.js');

const defaultScene = new Scene(
	'default',
	async (ctx) => {
		try {
			if (!ctx.session.userId) {
				ctx.session.userId = ctx.message.user_id;
			}
			ctx.reply(
				await createDefaultMenu(ctx.message.user_id),
				null,
				await createDefaultKeyboard(undefined, ctx),
			);

			ctx.scene.next();
		} catch (e) {
			ctx.scene.enter('error');
			console.error(e);
		}
	},
	async (ctx) => {
		try {
			switch (ctx.message.body) {
				case botCommands.adminPanel: {
					ctx.scene.enter('adminPanel');
					break;
				}
				case botCommands.contributorPanel: {
					ctx.scene.enter('contributorPanel');
					break;
				}
				case botCommands.checkHomework: {
					ctx.scene.enter('checkHomework');
					break;
				}
				case botCommands.checkAnnouncements: {
					ctx.scene.enter('checkAnnouncements');
					break;
				}
				case botCommands.checkSchedule: {
					ctx.scene.enter('checkSchedule');
					break;
				}
				case botCommands.settings: {
					ctx.scene.enter('settings');
					break;
				}
				case botCommands.giveFeedback: {
					ctx.scene.enter('giveFeedback');
					break;
				}
				case '1': {
					ctx.scene.enter('checkHomework');
					break;
				}
				case '2': {
					ctx.scene.enter('checkAnnouncements');
					break;
				}
				case '3': {
					ctx.scene.enter('checkSchedule');
					break;
				}
				case '4': {
					ctx.scene.enter('settings');
					break;
				}
				case '5': {
					ctx.scene.enter('giveFeedback');
				}
				default: {
					ctx.reply(botCommands.notUnderstood);
				}
			}
		} catch (e) {
			ctx.scene.enter('error');
			console.error(e);
		}
	},
);

module.exports = defaultScene;
