//@ts-check
const Scene = require('node-vk-bot-api/lib/scene'),
	{ createDefaultKeyboard, mapListToMessage } = require('../utils/messagePayloading.js'),
	{ DataBase: DB } = require('bot-database'),
	DataBase = new DB(process.env.MONGODB_URI),
	{ getSchoolName } = require('../utils/functions.js');

const classListScene = new Scene('classList', async (ctx) => {
	const Classes = await DataBase.getAllClasses(await getSchoolName(ctx));

	if (Classes.length > 0) {
		const classesStr = mapListToMessage(Classes.map((Class) => (Class ? Class.name : null)));

		const message = 'Список всех классов\n\t' + classesStr;

		ctx.reply(message, null, await createDefaultKeyboard(true, false));
	} else {
		ctx.reply('Не существует ни одного класса', null, await createDefaultKeyboard(true, false));
	}
	ctx.scene.enter('default');
});
module.exports = classListScene;
