//@ts-check
const path = require('path');
const fs = require('fs');
const Scene = require('node-vk-bot-api/lib/scene'),
	{ createDefaultKeyboard, createBackKeyboard } = require('../utils/messagePayloading.js'),
	{ DataBase: DB } = require('bot-database'),
	{ Roles } = require('bot-database/build/Models/utils.js'),
	Markup = require('node-vk-bot-api/lib/markup'),
	DataBase = new DB(process.env.MONGODB_URI);

const giveFeedback = new Scene(
	'giveFeedback',
	(ctx) => {
		ctx.scene.next();

		ctx.reply(
			'Что вы хотите сказать о нашем боте?',
			null,
			createBackKeyboard([[Markup.button('Мне все нравится, спасибо 😊', 'positive')]]),
		);
	},
	(ctx) => {
		const {
			message: { body, user_id },
		} = ctx;

		fs.readFile(path.join(__dirname, 'Feedback'), { encoding: 'utf8' }, (err, text) => {
			if (err) {
				throw err;
			}

			const newText = text + `${body} (${user_id}) \n`;

			fs.writeFile(
				path.join(__dirname, 'Feedback'),
				newText,
				{ encoding: 'utf8' },
				async (err) => {
					if (err) {
						throw err;
					}

					const adminsIds = await DataBase.getAllStudents()
						.then((students) => students.filter(({ role }) => role === Roles.admin))
						.then((admins) => admins.map(({ vkId }) => vkId));

					if (!adminsIds.some((id) => id === ctx.message.user_id)) {
						const notificationMessage = `Новый отзыв: \n` + `${body} (${user_id}) \n`;

						ctx.bot.sendMessage(adminsIds, notificationMessage);
					}

					ctx.reply(
						'Спасибо за отзыв',
						null,
						await createDefaultKeyboard(undefined, ctx),
					);
					ctx.scene.enter('default');
				},
			);
		});
	},
);

module.exports = giveFeedback;
