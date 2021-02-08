//@ts-check
const Scene = require('node-vk-bot-api/lib/scene'),
	{ createBackKeyboard } = require('../utils/messagePayloading.js'),
	{ DataBase: DB } = require('bot-database'),
	botCommands = require('../utils/botCommands.js'),
	{ daysOfWeek } = require('bot-database/build/Models/utils.js'),
	Markup = require('node-vk-bot-api/lib/markup'),
	DataBase = new DB(process.env.MONGODB_URI),
	{
		cleanDataForSceneFromSession,
		getDayScheduleString,
		getScheduleString,
	} = require('../utils/functions.js');

const checkScheduleScene = new Scene(
	'checkSchedule',
	(ctx) => {
		ctx.scene.next();
		ctx.reply(
			'Как вы хотите получить расписание?',
			null,
			createBackKeyboard([
				[
					Markup.button(botCommands.onToday, 'primary'),
					Markup.button(botCommands.onTomorrow, 'primary'),
				],
				[Markup.button(botCommands.onAllWeek, 'positive')],
			]),
		);
	},
	async (ctx) => {
		try {
			// const needToPickClass = await isAdmin(ctx);

			// if (needToPickClass && !ctx.session.Class) {
			// 	ctx.session.nextScene = 'checkSchedule';
			// 	ctx.session.pickFor = 'Выберите класс у которого хотите посмотреть расписание \n';
			// 	ctx.scene.enter('pickClass');
			// } else {
			const { body } = ctx.message;

			if (body.toLowerCase() === botCommands.back.toLowerCase()) {
				ctx.scene.enter('default');
			}
			const Student = await DataBase.getStudentByVkId(
				ctx.session.userId || ctx.message.user_id,
			);

			if (Student) {
				if (Student.registered) {
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
								ctx.scene.enter('default');
							}, 50);
						} else {
							ctx.reply(message);
							setTimeout(() => {
								ctx.scene.enter('default');
							}, 50);
						}
					} else if (body.toLowerCase() === botCommands.onAllWeek.toLowerCase()) {
						const message = getScheduleString(Class);

						if (message.trim() === '') {
							ctx.reply('Для данного класса пока что не существует расписания');
							setTimeout(() => {
								ctx.scene.enter('default');
							}, 50);
						} else {
							ctx.reply(message);
							setTimeout(() => {
								ctx.scene.enter('default');
							}, 50);
						}
					} else {
						ctx.reply(botCommands.notUnderstood);
					}
					cleanDataForSceneFromSession(ctx);
				} else {
					ctx.scene.enter('register');
					ctx.reply(
						'Сначала вам необходимо зарегестрироваться, введите имя класса в котором вы учитесь',
					);
				}
			} else {
				throw new Error(`User are not existing, ${ctx.session.userId}`);
			}
			// }
		} catch (e) {
			console.error(e);
			ctx.scene.enter('error');
		}
	},
);

module.exports = checkScheduleScene;
