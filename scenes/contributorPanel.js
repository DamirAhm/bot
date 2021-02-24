const { sceneNames } = require('../utils/constants.js');

//@ts-check
const Scene = require('node-vk-bot-api/lib/scene'),
	{
		createDefaultKeyboard,
		renderContributorMenu,
		renderContributorMenuKeyboard,
	} = require('../utils/messagePayloading.js'),
	{ DataBase: DB } = require('bot-database'),
	botCommands = require('../utils/botCommands.js'),
	{ Roles } = require('bot-database/build/Models/utils.js'),
	DataBase = new DB(process.env.MONGODB_URI);

const isContributor = async (ctx) => {
	let role = await DataBase.getRole(ctx.message.user_id);

	return [Roles.admin, Roles.contributor].includes(role);
};

const contributorPanelScene = new Scene(
	sceneNames.contributorPanel,
	async (ctx) => {
		const Class = await DataBase.getClassForStudent(ctx.message.user_id);

		if (Class === null) {
			ctx.reply(
				'Для использования данной функции необходимо войти в класс, для начала введите номер своей школы',
				null,
				createBackKeyboard([[Markup.button(botCommands.checkExisting)]]),
			);

			pickSchoolAndClassAction(ctx, {
				nextScene: sceneNames.contributorPanel,
			});
			return;
		}

		if (await isContributor(ctx)) {
			ctx.reply(renderContributorMenu(), null, renderContributorMenuKeyboard());
			ctx.scene.next();
		} else {
			ctx.scene.leave();
			ctx.reply(
				'Ты не редактор чтоб такое делать',
				null,
				await createDefaultKeyboard(undefined, ctx),
			);
		}
	},
	async (ctx) => {
		try {
			if (['0', botCommands.back].includes(ctx.message.body.trim())) {
				ctx.scene.enter(sceneNames.default);
				return;
			}

			switch (ctx.message.body.trim().toLowerCase()) {
				case '1': {
					ctx.scene.enter(sceneNames.addHomework);
					break;
				}
				case '2': {
					ctx.scene.enter(sceneNames.addAnnouncement);
					break;
				}
				case '3': {
					ctx.scene.enter(sceneNames.changeSchedule);
					break;
				}
				case '4': {
					ctx.scene.enter(sceneNames.addRedactor);
					break;
				}
				case botCommands.addRedactor.toLowerCase(): {
					ctx.scene.enter(sceneNames.addRedactor);
					break;
				}
				case botCommands.addHomework.toLowerCase(): {
					ctx.scene.enter(sceneNames.addHomework);
					break;
				}
				case botCommands.addAnnouncement.toLowerCase(): {
					ctx.scene.enter(sceneNames.addAnnouncement);
					break;
				}
				case botCommands.changeSchedule.toLowerCase(): {
					ctx.scene.enter(sceneNames.changeSchedule);
					break;
				}
				default: {
					ctx.reply(botCommands.notUnderstood);
					break;
				}
			}
		} catch (e) {
			ctx.scene.leave();
			ctx.reply(
				'Простите произошла ошибка',
				null,
				await createDefaultKeyboard(undefined, ctx),
			);
			console.error(e);
		}
	},
);
module.exports = contributorPanelScene;
