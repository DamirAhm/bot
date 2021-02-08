//@ts-check
const Scene = require('node-vk-bot-api/lib/scene'),
	{ createDefaultKeyboard } = require('../utils/messagePayloading.js'),
	{ DataBase: DB } = require('bot-database'),
	DataBase = new DB(process.env.MONGODB_URI);

const errorScene = new Scene('error', async (ctx) => {
	const Student = await DataBase.getStudentByVkId(ctx.message.user_id);

	if (Student && Student.registered) {
		ctx.reply('Простите произошла ошибка', null, await createDefaultKeyboard(undefined, ctx));
		ctx.scene.enter('default');
	} else {
		ctx.reply('Простите произошла ошибка');

		setTimeout(() => {
			ctx.scene.enter('register');
		}, 75);
	}
});

module.exports = errorScene;
