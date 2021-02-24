//@ts-check
const Scene = require('node-vk-bot-api/lib/scene'),
	{ createDefaultKeyboard } = require('../utils/messagePayloading.js');
const { sceneNames } = require('../utils/constants.js');

const startScene = new Scene(sceneNames.start, async (ctx) => {
	ctx.reply(
		`Привет ${ctx.session.firstName} ${ctx.session.secondName}`,
		null,
		await createDefaultKeyboard(undefined, ctx),
	);
	ctx.scene.enter(sceneNames.default);
});

module.exports = startScene;
