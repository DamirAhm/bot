//@ts-check

const { isValidClassName } = require('bot-database/build/Models/utils');
const { buttonColors, sceneNames } = require('../utils/constants.js');
const { cleanSession } = require('../utils/sessionCleaners.js');

const Scene = require('node-vk-bot-api/lib/scene'),
	{ mapListToMessage, createBackKeyboard } = require('../utils/messagePayloading.js'),
	{ DataBase: DB } = require('bot-database'),
	botCommands = require('../utils/botCommands.js'),
	Markup = require('node-vk-bot-api/lib/markup'),
	DataBase = new DB(process.env.MONGODB_URI),
	{ calculateColumnsAmount, getSchoolName } = require('../utils/functions.js');

const neededInSession = ['step', 'nextScene'];

const pickClassScene = new Scene(
	sceneNames.pickClass,
	async (ctx) => {
		try {
			if (!neededInSession.every((it) => it in ctx.session)) {
				throw new Error(
					`Some of needed props in session are missed: 
					 needed: ${neededInSession.join(' ,')} 
					 got: ${JSON.stringify(ctx.session)} `,
				);
			}

			const Classes = await DataBase.getAllClasses(
				await DataBase.getSchoolForStudent(ctx.message.user_id).then((school) =>
					school ? school.name : null,
				),
			);
			if (Classes.length > 0) {
				ctx.session.classes = Classes;

				const classesStr = mapListToMessage(
					Classes.map((Class) => (Class ? Class.name : null)),
				);

				const message = (ctx.session.pickFor ?? 'Выберите класс') + classesStr;

				ctx.scene.next();
				const columns = calculateColumnsAmount(Classes.length);

				ctx.reply(
					message,
					null,
					createBackKeyboard(
						Classes.map(({ name }, i) =>
							Markup.button(name, buttonColors.default, { button: name }),
						),
						columns,
					),
				);
			} else {
				ctx.scene.enter(sceneNames.default);
				ctx.reply('Не существует ни одного класса');
			}
		} catch (e) {
			console.error(e);
			ctx.scene.enter(sceneNames.error);
		}
	},
	async (ctx) => {
		try {
			if (ctx.message.body === botCommands.back) {
				ctx.scene.enter(
					ctx.session.backScene ?? sceneNames.default,
					ctx.session.backStep ?? 0,
				);
				return;
			}

			let {
				message: { body: classIndex },
			} = ctx;

			let { classes } = ctx.session;

			if (!classes) {
				classes = await DataBase.getAllClasses(
					await DataBase.getSchoolForStudent(ctx.message.user_id).then((School) =>
						School ? School.name : null,
					),
				);
			}

			let Class;

			classIndex = classIndex.toUpperCase();

			if (isValidClassName(classIndex)) {
				Class = await DataBase.getClassByName(
					classIndex,
					await DataBase.getSchoolForStudent(ctx.message.user_id).then((School) =>
						School ? School.name : null,
					),
				);
			} else if (!isNaN(+classIndex) && +classIndex < classes.length) {
				Class = classes[classIndex - 1];
			}

			if (!Class) {
				Class = await DataBase.createClass(classIndex, await getSchoolName(ctx));
			}

			ctx.session.Class = Class;
			ctx.scene.enter(ctx.session.nextScene, ctx.session.step);

			cleanSession(ctx);
		} catch (e) {
			console.error(e);
			ctx.scene.enter(sceneNames.error);
		}
	},
);
module.exports = pickClassScene;
