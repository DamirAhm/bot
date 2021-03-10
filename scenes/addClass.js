//@ts-check

const { sceneNames } = require('../utils/constants.js');
const Scene = require('node-vk-bot-api/lib/scene'),
	{ createBackKeyboard } = require('../utils/messagePayloading.js'),
	{ DataBase: DB } = require('bot-database'),
	botCommands = require('../utils/botCommands.js'),
	DataBase = new DB(process.env.MONGODB_URI);

const addClassScene = new Scene(
	sceneNames.addClass,
	(ctx) => {
		ctx.reply('Введите имя класса (цифра буква)', null, createBackKeyboard());
		ctx.scene.next();
	},
	async (ctx) => {
		try {
			if (ctx.message.body.trim() === botCommands.back) {
				ctx.scene.enter(sceneNames.default);
				return;
			}
			const {
				message: { body },
				scene: { enter },
			} = ctx;
			const spacelessClassName = body.replace(/\s*/g, '');
			if (/\d+([a-z]|[а-я])/i.test(spacelessClassName)) {
				const School = await DataBase.getSchoolForStudent(ctx.message.user_id);
				const schoolName = School ? School.name : null;
				const Class = await DataBase.createClass(spacelessClassName, schoolName);
				if (Class) {
					ctx.reply('Класс успешно создан');
					ctx.scene.enter(sceneNames.default);
				} else {
					ctx.reply('Создание класса не удалось');
				}
			} else {
				enter(sceneNames.addClass);
				ctx.reply('Неправильный формат ввода (должна быть цифра и потом буква)');
			}
		} catch (err) {
			console.error(err);
			ctx.reply('Что то пошло не так попробуйте позже');
		}
	},
);
module.exports = addClassScene;
