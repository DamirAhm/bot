//@ts-check

const config = require('../config.js');
const { buttonColors, sceneNames } = require('../utils/constants.js');
const { isTomorrowSunday, isTodaySunday } = require('../utils/dateFunctions.js');
const Scene = require('node-vk-bot-api/lib/scene'),
	{ createBackKeyboard } = require('../utils/messagePayloading.js'),
	{ DataBase: DB } = require('bot-database'),
	botCommands = require('../utils/botCommands.js'),
	{ daysOfWeek } = require('bot-database/build/Models/utils.js'),
	Markup = require('node-vk-bot-api/lib/markup'),
	DataBase = new DB(process.env.MONGODB_URI),
	{ isAdmin } = require('../utils/roleChecks.js'),
	{ getDayScheduleString, getScheduleString, mapButtons } = require('../utils/functions.js'),
	{ cleanDataForSceneFromSession } = require('../utils/sessionCleaners.js'),
	{ pickSchoolAndClassAction } = require('../utils/actions');

const { isNeedToPickClass } = config;

const checkScheduleScene = new Scene(
	sceneNames.checkSchedule,
	(ctx) => {
		ctx.scene.next();
		ctx.reply(
			'Как вы хотите получить расписание?',
			null,
			createBackKeyboard([
				mapButtons([
					[!isTodaySunday(), Markup.button(botCommands.onToday, buttonColors.primary)],
					[
						!isTomorrowSunday(),
						Markup.button(botCommands.onTomorrow, buttonColors.primary),
					],
				]),
				[Markup.button(botCommands.onAllWeek, buttonColors.positive)],
			]),
		);
	},
	async (ctx) => {
		try {
			const needToPickClass = (await isAdmin(ctx)) && isNeedToPickClass;

			if (needToPickClass && !ctx.session.Class) {
				ctx.session.nextScene = sceneNames.checkSchedule;
				ctx.session.pickFor = 'Выберите класс у которого хотите посмотреть расписание \n';
				ctx.scene.enter(sceneNames.pickClass);
			} else {
				const { body } = ctx.message;

				if (body.toLowerCase() === botCommands.back.toLowerCase()) {
					ctx.scene.enter(sceneNames.default);
					return;
				}

				const Student = await DataBase.getStudentByVkId(
					ctx.session.userId || ctx.message.user_id,
				);

				if (Student) {
					if (Student.registered) {
						if (Student.class === null) {
							ctx.reply(
								'Для использования данной функции необходимо войти в класс, для начала введите номер своей школы',
								null,
								createBackKeyboard([[Markup.button(botCommands.checkExisting)]]),
							);

							pickSchoolAndClassAction(ctx, {
								nextScene: sceneNames.checkSchedule,
							});
							return;
						}

						let { Class } = ctx.session;
						if (!Class) {
							Class = await DataBase.getClassBy_Id(Student.class);
						}

						if (
							[
								botCommands.onToday.toLowerCase(),
								botCommands.onTomorrow.toLowerCase(),
							].includes(body.toLowerCase())
						) {
							const dayOffset =
								body.toLowerCase() === botCommands.onToday.toLowerCase() ? -1 : 0;

							const message = getDayScheduleString(
								Class.schedule[new Date().getDay() + dayOffset],
								daysOfWeek[new Date().getDay() + dayOffset],
							);

							if (message.trim() === '') {
								ctx.reply(
									`Для данного класса пока что не существует расписания на ${
										daysOfWeek[new Date().getDay() - 1]
									}`,
								);
								setTimeout(() => {
									ctx.scene.enter(sceneNames.default);
								}, 50);
							} else {
								ctx.reply(message);
								setTimeout(() => {
									ctx.scene.enter(sceneNames.default);
								}, 50);
							}
						} else if (body.toLowerCase() === botCommands.onAllWeek.toLowerCase()) {
							const message = getScheduleString(Class);

							if (message.trim() === '') {
								ctx.reply('Для данного класса пока что не существует расписания');
								setTimeout(() => {
									ctx.scene.enter(sceneNames.default);
								}, 50);
							} else {
								ctx.reply(message);
								setTimeout(() => {
									ctx.scene.enter(sceneNames.default);
								}, 50);
							}
						} else {
							ctx.reply(botCommands.notUnderstood);
						}
						cleanDataForSceneFromSession(ctx);
					} else {
						ctx.scene.enter(sceneNames.register);
						ctx.reply(
							'Сначала вам необходимо зарегестрироваться, введите имя класса в котором вы учитесь',
						);
					}
				} else {
					throw new Error(`User are not existing, ${ctx.session.userId}`);
				}
			}
		} catch (e) {
			console.error(e);
			ctx.scene.enter(sceneNames.error);
		}
	},
);

module.exports = checkScheduleScene;
