const { sceneNames } = require('../utils/constants.js');

//@ts-check
const Scene = require('node-vk-bot-api/lib/scene'),
	{ createDefaultKeyboard, createBackKeyboard } = require('../utils/messagePayloading.js'),
	{ DataBase: DB } = require('bot-database'),
	botCommands = require('../utils/botCommands.js'),
	{ Roles } = require('bot-database/build/Models/utils.js'),
	DataBase = new DB(process.env.MONGODB_URI);

const removeRedactorScene = new Scene(
	sceneNames.removeRedactor,
	(ctx) => {
		ctx.reply(
			'Введите id пользователя, которого хотите лишить должности редактора',
			null,
			createBackKeyboard(),
		);
		ctx.scene.next();
	},
	async (ctx) => {
		try {
			const {
				message: { body },
			} = ctx;

			if (body.trim() === botCommands.back) {
				ctx.scene.enter(sceneNames.default);
			} else {
				const id = Number(body.trim());

				if (!isNaN(id)) {
					let Student = await DataBase.getStudentByVkId(id);

					if (Student && Student.role === Roles.admin) {
						ctx.reply(
							'Пользователя нельзя понизить в роли, так как он является администратором',
							null,
							await createDefaultKeyboard(undefined, ctx),
						);
						ctx.scene.enter(sceneNames.default);
						return;
					} else if (Student.role === Roles.student) {
						ctx.reply(
							'Пользователь уже не является редактором',
							null,
							await createDefaultKeyboard(undefined, ctx),
						);
						ctx.scene.enter(sceneNames.default);
						return;
					} else {
						ctx.reply(
							'Такого пользователя не существует',
							null,
							await createDefaultKeyboard(undefined, ctx),
						);
					}

					await DataBase.backStudentToInitialRole(Student);

					ctx.reply(
						'Пользователь перестал быть редактором',
						null,
						await createDefaultKeyboard(undefined, ctx),
					);
					ctx.scene.enter(sceneNames.default);
				} else {
					ctx.reply('Неверный id');
					ctx.scene.enter(sceneNames.removeRedactor);
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
module.exports = removeRedactorScene;
