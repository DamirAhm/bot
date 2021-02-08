//@ts-check
const Scene = require('node-vk-bot-api/lib/scene'),
	{ createDefaultKeyboard, mapListToMessage } = require('../utils/messagePayloading.js'),
	{ DataBase: DB } = require('bot-database'),
	DataBase = new DB(process.env.MONGODB_URI),
	{ getSchoolName, mapStudentToPreview } = require('../utils/functions.js');

const redactorsListScene = new Scene('redactorsList', async (ctx) => {
	const Contributors = await DataBase.getAllContributors(await getSchoolName(ctx));

	if (Contributors.length > 0) {
		const classesStr = mapListToMessage(mapStudentToPreview(Contributors));

		const message = 'Список всех редакторов\n\t' + classesStr;

		ctx.reply(message, null, await createDefaultKeyboard(true));
	} else {
		ctx.reply('Не существует ни одного редактора', null, await createDefaultKeyboard(true));
	}

	ctx.scene.enter('default');
});
module.exports = redactorsListScene;
