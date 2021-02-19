//@ts-check
const Scene = require('node-vk-bot-api/lib/scene'),
	{
		createDefaultKeyboard,
		createBackKeyboard,
		monthsRP,
	} = require('../utils/messagePayloading.js'),
	{ DataBase: DB } = require('bot-database'),
	{ mapHomeworkByLesson } = require('bot-database/build/utils/functions'),
	botCommands = require('../utils/botCommands.js'),
	{ Roles } = require('bot-database/build/Models/utils.js'),
	Markup = require('node-vk-bot-api/lib/markup'),
	DataBase = new DB(process.env.MONGODB_URI),
	{
		getTomorrowDate,
		filterContentByDate,
		sendHomework,
		getHomeworkPayload,
		getDayMonthString,
		cleanDataForSceneFromSession,
		getLengthOfHomeworkWeek,
		parseDate,
		validateDate,
		isAdmin,
	} = require('../utils/functions.js');

const isNeedToPickClass = false;

const dateRegExp = /[0-9]+\.[0-9]+(\.[0-9])?/;

const checkHomeworkScene = new Scene(
	'checkHomework',
	async (ctx) => {
		try {
			if (ctx.message.body.toLowerCase() === botCommands.back.toLowerCase()) {
				ctx.scene.enter('default');
				return;
			}

			const needToPickClass = (await isAdmin(ctx)) && isNeedToPickClass;
			if (needToPickClass && !ctx.session.Class) {
				ctx.session.nextScene = 'checkHomework';
				ctx.session.pickFor = 'Выберите класс у которого хотите посмотреть дз \n';
				ctx.scene.enter('pickClass');
			} else {
				const Student = await DataBase.getStudentByVkId(
					ctx.session.userId || ctx.message.user_id,
				);
				if (Student) {
					if (Student.registered) {
						if (!ctx.session.Class)
							ctx.session.Class = await DataBase.getClassBy_Id(Student.class);

						ctx.scene.next();
						ctx.reply(
							'На какую дату вы хотите узнать задание? (в формате ДД.ММ)',
							null,
							createBackKeyboard([
								[Markup.button(botCommands.onTomorrow, 'positive')],
								[
									Markup.button(
										new Date().getDay() >= 5
											? botCommands.nextWeek
											: botCommands.thisWeek,
										'primary',
									),
								],
							]),
						);
					} else {
						ctx.scene.enter('register');
					}
				} else {
					throw new Error('Student is not exists');
				}
			}
		} catch (e) {
			console.error(e);
			ctx.scene.enter('error');
		}
	},
	async (ctx) => {
		try {
			const {
				message: { body },
			} = ctx;

			if (body.toLowerCase() === botCommands.back.toLowerCase()) {
				const isPickedClass = await isAdmin(ctx);
				if (isPickedClass) {
					ctx.session.Class = undefined;
					ctx.scene.enter('checkHomework');
				} else {
					ctx.scene.enter('default');
				}
			} else if (
				body.toLowerCase() === botCommands.thisWeek.toLowerCase() ||
				body.toLowerCase() === botCommands.nextWeek.toLowerCase()
			) {
				const messageDelay = 50;

				const today = new Date();
				const weekDay = today.getDay();
				const daysOfHomework = getLengthOfHomeworkWeek();

				let startDay = today.getDate();
				if (weekDay >= 5) {
					startDay = new Date().getDate() + (7 - weekDay + 1);
				}

				let delayAmount = 0;

				for (let i = 0; i < daysOfHomework; i++) {
					setTimeout(async () => {
						const dayOfHomework = startDay + i;
						const dateItMilliseconds = new Date(
							today.getFullYear(),
							today.getMonth(),
							dayOfHomework,
						);
						const date = new Date(dateItMilliseconds);

						const dateString = getDayMonthString(date);

						const homework = await DataBase.getHomeworkByDate(
							{
								classNameOrInstance: ctx.session.Class,
								schoolName: ctx.session.Class.schoolName,
							},
							date,
						);

						if (homework.length === 0) {
							//? IIFE to make amountOfHomework local closure elsewhere it would be saved as valiable at moment when setTimeout callback will be executed
							((delayAmount) =>
								setTimeout(() => {
									ctx.reply(`На ${dateString} не заданно ни одного задания`);
								}, messageDelay * delayAmount))(delayAmount);
							delayAmount++;
						} else {
							const parsedHomework = mapHomeworkByLesson(homework);

							let headerMessage = `Задание на ${dateString}\n`;

							setTimeout(() => {
								try {
									ctx.reply(headerMessage);
								} catch (e) {
									console.error(e);
								}
							}, delayAmount++ * messageDelay);

							let homeworkIndex = 0;
							for (const [lesson, homework] of parsedHomework) {
								const { homeworkMessage, attachments } = getHomeworkPayload(
									lesson,
									homework,
								);

								setTimeout(() => {
									try {
										ctx.reply(homeworkMessage, attachments);
									} catch (e) {
										console.error(e);
									}
								}, delayAmount * messageDelay + (homeworkIndex * messageDelay) / 10);

								homeworkIndex++;
								delayAmount++;
							}
						}
					}, i * messageDelay);
				}

				setTimeout(() => {
					setTimeout(() => {
						ctx.scene.enter('default');
						ctx.session.Class = undefined;
					}, delayAmount * messageDelay * 2);
				}, daysOfHomework * messageDelay);
			} else {
				let date = null;

				if (body === botCommands.onTomorrow) {
					date = getTomorrowDate();
				} else if (dateRegExp.test(body)) {
					const [day, month, year = new Date().getFullYear()] = parseDate(body);

					if (validateDate(month, day, year)) {
						date = new Date(year, month - 1, day);
					} else {
						ctx.reply('Проверьте правильность введенной даты');
						return;
					}
				} else {
					ctx.reply('Дата должна быть в формате ДД.ММ');
					return;
				}

				if (date) {
					const homework = filterContentByDate(ctx.session.Class.homework, date);
					if (homework.length === 0) {
						ctx.reply('На данный день не заданно ни одного задания');
						ctx.scene.enter('default');
					} else {
						//@ts-ignore
						const parsedHomework = mapHomeworkByLesson(homework);

						let message = `Задание на ${date.getDate()} ${monthsRP[date.getMonth()]}\n`;

						ctx.reply(message, null, await createDefaultKeyboard(undefined, ctx));

						sendHomework(parsedHomework, ctx.bot, [ctx.message.user_id]);

						ctx.scene.enter('default');
					}
				} else {
					throw new Error("There's no date");
				}
			}

			cleanDataForSceneFromSession(ctx);
		} catch (e) {
			console.error(e);
			ctx.scene.enter('error');
		}
	},
);

module.exports = checkHomeworkScene;
