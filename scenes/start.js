//@ts-checkw
const Scene = require('node-vk-bot-api/lib/scene'),
	{ createDefaultKeyboard } = require('../utils/messagePayloading.js');

const startScene = new Scene('start', async (ctx) => {
	ctx.reply(
		`Привет ${ctx.session.firstName} ${ctx.session.secondName}`,
		null,
		await createDefaultKeyboard(undefined, ctx),
	);
	ctx.scene.enter('default');
});

module.exports = startScene;
