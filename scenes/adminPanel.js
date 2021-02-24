const { sceneNames } = require('../utils/constants.js');

//@ts-check
const Scene = require('node-vk-bot-api/lib/scene'),
	{
		renderAdminMenu,
		renderAdminMenuKeyboard,
		createDefaultKeyboard,
		mapListToMessage,
	} = require('../utils/messagePayloading.js'),
	{ DataBase: DB } = require('bot-database'),
	botCommands = require('../utils/botCommands.js'),
	DataBase = new DB(process.env.MONGODB_URI),
	{ getSchoolName, mapStudentToPreview } = require('../utils/functions.js'),
	{ isAdmin } = require('../utils/roleChecks.js');

const adminPanel = new Scene(
	sceneNames.adminPanel,
	async (ctx) => {
		if (await isAdmin(ctx)) {
			ctx.scene.next();
			ctx.reply(renderAdminMenu(), null, renderAdminMenuKeyboard());
		} else {
			ctx.scene.leave();
			ctx.reply(
				'Ты не админ чтоб такое делать',
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

			switch (ctx.message.body.trim()) {
				case '1': {
					ctx.scene.enter(sceneNames.removeRedactor);
					break;
				}
				case '2': {
					const Contributors = await DataBase.getAllContributors(
						await getSchoolName(ctx),
					);

					if (Contributors.length > 0) {
						//
						const classesStr = mapListToMessage(mapStudentToPreview(Contributors));

						const message = 'Список всех редакторов\n\t' + classesStr;

						ctx.reply(message, null, await createDefaultKeyboard(undefined, ctx));
					} else {
						ctx.reply(
							'Не существует ни одного редактора',
							null,
							await createDefaultKeyboard(undefined, ctx),
						);
					}
					ctx.scene.enter(sceneNames.default);
					break;
				}
				case '3': {
					ctx.scene.enter(sceneNames.addClass);
					break;
				}
				case '4': {
					const Classes = await DataBase.getAllClasses(await getSchoolName(ctx));

					if (Classes.length > 0) {
						const classesStr = mapListToMessage(
							Classes.map((Class) => (Class ? Class.name : null)),
						);

						const message = 'Список всех классов\n\t' + classesStr;

						ctx.reply(message, null, await createDefaultKeyboard(undefined, ctx));
					} else {
						ctx.reply(
							'Не существует ни одного класса',
							null,
							await createDefaultKeyboard(undefined, ctx),
						);
					}
					ctx.scene.enter(sceneNames.default);
					break;
				}
				case botCommands.removeRedactor: {
					ctx.scene.enter(sceneNames.removeRedactor);
					break;
				}
				case botCommands.redactorsList: {
					ctx.scene.enter(sceneNames.redactorsList);
					break;
				}
				case botCommands.addClass: {
					ctx.scene.enter(sceneNames.addClass);
					break;
				}
				case botCommands.classList: {
					ctx.scene.enter(sceneNames.classList);
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

module.exports = adminPanel;
