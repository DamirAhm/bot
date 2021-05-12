//@ts-check
const { DataBase: DB } = require("bot-database/build/DataBase");
const Scene = require("node-vk-bot-api/lib/scene"),
	{
		createDefaultMenu,
		createDefaultKeyboard,
		getUsableOptionsList,
		userOptions,
	} = require("../utils/messagePayloading.js"),
	botCommands = require("../utils/botCommands.js"),
	{ sceneNames } = require("../utils/constants.js"),
	{
		changeSchoolAction,
		pickSchoolAndClassAction,
	} = require("../utils/actions");

const DataBase = new DB(process.env.MONGODB_URI);

const defaultScene = new Scene(
	sceneNames.default,
	async (ctx) => {
		try {
			if (!ctx.session.userId) {
				ctx.session.userId = ctx.message.user_id;
			}
			ctx.reply(
				await createDefaultMenu(ctx.message.user_id),
				null,
				await createDefaultKeyboard(undefined, ctx)
			);

			ctx.scene.next();
		} catch (e) {
			ctx.scene.enter(sceneNames.error);
			console.error(e);
		}
	},
	async (ctx) => {
		try {
			const Student = await DataBase.getStudentByVkId(ctx.message.user_id);
			const options = getUsableOptionsList(Student.role, Student.class);
			const text = ctx.message.body.toLowerCase();

			if (text === botCommands.pickSchoolAndClass.toLowerCase()) {
				pickSchoolAndClassAction(ctx);
			} else if (
				userOptions.find(({ label }) => text === label.toLowerCase())
			) {
				ctx.scene.enter(
					userOptions.find(({ label }) => text === label.toLowerCase()).payload
				);
			} else if (!isNaN(text) && options[parseInt(text) - 1]) {
				ctx.scene.enter(options[parseInt(text) - 1].payload);
			} else {
				ctx.reply(botCommands.notUnderstood);
			}
		} catch (e) {
			ctx.scene.enter(sceneNames.error);
			console.error(e);
		}
	}
);

module.exports = defaultScene;
