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
	{ Roles } = require('bot-database/build/Models/utils.js'),
	DataBase = new DB(process.env.MONGODB_URI),
	{ getSchoolName, mapStudentToPreview, isAdmin } = require('../utils/functions.js');

const adminPanel = new Scene(
	'adminPanel',
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
				ctx.scene.enter('default');
				return;
			}

			switch (ctx.message.body.trim()) {
				case '1': {
					ctx.scene.enter('removeRedactor');
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

						ctx.reply(message, null, await createDefaultKeyboard(true));
					} else {
						ctx.reply(
							'Не существует ни одного редактора',
							null,
							await createDefaultKeyboard(true),
						);
					}
					ctx.scene.enter('default');
					break;
				}
				case '3': {
					ctx.scene.enter('addClass');
					break;
				}
				case '4': {
					const Classes = await DataBase.getAllClasses(await getSchoolName(ctx));

					if (Classes.length > 0) {
						const classesStr = mapListToMessage(
							Classes.map((Class) => (Class ? Class.name : null)),
						);

						const message = 'Список всех классов\n\t' + classesStr;

						ctx.reply(message, null, await createDefaultKeyboard(true, false));
					} else {
						ctx.reply(
							'Не существует ни одного класса',
							null,
							await createDefaultKeyboard(true, false),
						);
					}
					ctx.scene.enter('default');
					break;
				}
				case botCommands.removeRedactor: {
					ctx.scene.enter('removeRedactor');
					break;
				}
				case botCommands.redactorsList: {
					ctx.scene.enter('redactorsList');
					break;
				}
				case botCommands.addClass: {
					ctx.scene.enter('addClass');
					break;
				}
				case botCommands.classList: {
					ctx.scene.enter('classList');
					break;
				}
				default: {
					ctx.reply(botCommands.notUnderstood);
					break;
				}
			}
		} catch (e) {
			ctx.scene.leave();
			ctx.reply('Простите произошла ошибка', null, await createDefaultKeyboard(true, false));
			console.error(e);
		}
	},
);

module.exports = adminPanel;
