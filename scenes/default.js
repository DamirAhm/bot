//@ts-check
const { DataBase: DB } = require('bot-database/build/DataBase');
const Scene = require('node-vk-bot-api/lib/scene'),
	{
		createDefaultMenu,
		createDefaultKeyboard,
		getUsableOptionsList,
	} = require('../utils/messagePayloading.js'),
	botCommands = require('../utils/botCommands.js'),
	{ sceneNames } = require('../utils/constants.js'),
	{ changeSchoolAction, pickSchoolAndClassAction } = require('../utils/actions');

const DataBase = new DB(process.env.MONGODB_URI);

const defaultScene = new Scene(
	sceneNames.default,
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
			ctx.scene.enter(sceneNames.error);
			console.error(e);
		}
	},
	async (ctx) => {
		try {
			const Student = await DataBase.getStudentByVkId(ctx.message.user_id);
			const options = getUsableOptionsList(Student.role, Student.class);

			switch (ctx.message.body) {
				case botCommands.checkHomework: {
					ctx.scene.enter(sceneNames.checkHomework);
					break;
				}
				case botCommands.checkAnnouncements: {
					ctx.scene.enter(sceneNames.checkAnnouncements);
					break;
				}
				case botCommands.checkSchedule: {
					ctx.scene.enter(sceneNames.checkSchedule);
					break;
				}
				case botCommands.settings: {
					ctx.scene.enter(sceneNames.settings);
					break;
				}
				case botCommands.contributorPanel: {
					ctx.scene.enter(sceneNames.contributorPanel);
					break;
				}
				case botCommands.giveFeedback: {
					ctx.scene.enter(sceneNames.giveFeedback);
					break;
				}
				case botCommands.adminPanel: {
					ctx.scene.enter(sceneNames.adminPanel);
					break;
				}
				case botCommands.pickSchoolAndClass: {
					pickSchoolAndClassAction(ctx);
					break;
				}
				default: {
					if (!isNaN(+ctx.message.body) && options[+ctx.message.body - 1]) {
						ctx.scene.enter(options[+ctx.message.body - 1].payload);
					} else {
						ctx.reply(botCommands.notUnderstood);
					}
				}
			}
		} catch (e) {
			ctx.scene.enter(sceneNames.error);
			console.error(e);
		}
	},
);

module.exports = defaultScene;
