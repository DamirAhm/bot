//@ts-check
const Scene = require('node-vk-bot-api/lib/scene'),
	{ createDefaultKeyboard, createBackKeyboard } = require('../utils/messagePayloading.js'),
	{ DataBase: DB } = require('bot-database'),
	botCommands = require('../utils/botCommands.js'),
	{ Roles } = require('bot-database/build/Models/utils.js'),
	DataBase = new DB(process.env.MONGODB_URI);

const removeRedactorScene = new Scene(
	'removeRedactor',
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
			if (ctx.message.body.trim() === botCommands.back) {
				ctx.scene.enter('default');
			}
			const {
				message: { body },
				scene: { leave, enter },
			} = ctx;
			const id = Number(body.trim());

			if (!isNaN(id)) {
				let Student = await DataBase.getStudentByVkId(id);

				if (Student && Student.role === Roles.admin) {
					ctx.reply(
						'Пользователя нельзя понизить в роли, так как он является администратором',
						null,
						await createDefaultKeyboard(true, false),
					);
					ctx.scene.enter('default');
					return;
				} else if (!Student || Student.role === Roles.student) {
					ctx.reply(
						'Пользователь уже не является редактором',
						null,
						await createDefaultKeyboard(true, false),
					);
					ctx.scene.enter('default');
					return;
				}

				Student.role = Roles.student;
				await Student.save();

				ctx.reply(
					'Пользователь перестал быть редактором',
					null,
					await createDefaultKeyboard(true, false),
				);
				ctx.scene.enter('default');
			} else {
				ctx.reply('Неверный id');
				ctx.scene.enter('removeRedactor');
			}
		} catch (e) {
			ctx.scene.leave();
			ctx.reply('Простите произошла ошибка', null, await createDefaultKeyboard(true, false));
			console.error(e);
		}
	},
);
module.exports = removeRedactorScene;
