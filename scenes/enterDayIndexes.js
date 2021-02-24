//@ts-check
const Scene = require('node-vk-bot-api/lib/scene'),
	{ createBackKeyboard } = require('../utils/messagePayloading.js'),
	botCommands = require('../utils/botCommands.js'),
	{ cleanSession } = require('../utils/sessionCleaners.js');
const { sceneNames } = require('../utils/constants.js');

const enterDayIndexesScene = new Scene(
	sceneNames.enterDaysIndexes,
	(ctx) => {
		ctx.scene.next();
		ctx.reply(
			'Введите за сколько дней до задания вы хотите получать уведомление (можно несколько через запятую или пробел)',
			null,
			createBackKeyboard(),
		);
	},
	(ctx) => {
		const {
			message: { body },
		} = ctx;

		if (body === botCommands.back) {
			ctx.scene.enter(ctx.session.backScene ?? sceneNames.default, ctx.session.backStep ?? 0);
			return;
		}

		const indexes = body.replace(/,/g, ' ').replace(/\s\s/g, ' ').split(' ');

		if (
			indexes.length > 0 &&
			indexes.every((index) => !isNaN(+index) && +index >= 0) &&
			indexes.every((index) => Number.isInteger(+index))
		) {
			ctx.session.enteredDayIndexes = indexes.map(Number);
			ctx.scene.enter(ctx.session.nextScene ?? sceneNames.default, ctx.session.step ?? 0);
		} else {
			ctx.reply('Вы должны ввести одно или более целых чисел');
		}

		cleanSession(ctx);
	},
);

module.exports = enterDayIndexesScene;
