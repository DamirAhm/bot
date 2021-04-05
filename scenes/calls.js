//@ts-check
const Markup = require('node-vk-bot-api/lib/markup');
const Scene = require('node-vk-bot-api/lib/scene');
const botCommands = require('../utils/botCommands');
const { sceneNames, buttonColors } = require('../utils/constants');
const {
	createBackKeyboard,
	mapListToMessage,
	createDefaultKeyboard,
} = require('../utils/messagePayloading');
const { DataBase: DB } = require('bot-database');
const {
	isTodaySunday,
	getTimeFromDate,
	getDiffBetweenTimesInMinutes,
} = require('../utils/dateFunctions');
const { mapButtons } = require('../utils/functions');
const { cleanDataForSceneFromSession } = require('../utils/sessionCleaners');

const DataBase = new DB(process.env.MONGODB_URI);

const { button } = Markup;

const callsScene = new Scene(
	sceneNames.calls,
	async (ctx) => {
		const School = await DataBase.getSchoolForStudent(ctx.message.user_id);

		if (School.callSchedule.defaultSchedule.length === 0) {
			ctx.reply(
				'Расписание звонков в вашей школе пока не заполнено',
				null,
				await createDefaultKeyboard(undefined, ctx),
			);
			ctx.scene.enter(sceneNames.default);
			return;
		}

		ctx.session.School = School;

		ctx.reply(
			'Что вы хотите узнать?',
			null,
			createBackKeyboard([
				mapButtons([
					button(botCommands.checkCallSchedule, buttonColors.primary),
					[
						!isTodaySunday(),
						button(botCommands.checkTimeTillNextCall, buttonColors.primary),
					],
				]),
			]),
		);
		ctx.scene.next();
	},
	async (ctx) => {
		const { body } = ctx.message;

		switch (body.toLowerCase()) {
			case botCommands.back.toLowerCase(): {
				ctx.scene.enter(sceneNames.default);
				return;
			}
			case botCommands.checkCallSchedule.toLowerCase(): {
				const { School } = ctx.session;
				const currentWeekDay = new Date().getDay() === 0 ? 7 : new Date().getDay();

				let callSchedule = await DataBase.getCallCheduleForDay(School, currentWeekDay);

				const callScheduleStrings = callSchedule.map(
					({ start, end }) => `${start} - ${end}`,
				);

				ctx.reply(
					mapListToMessage(callScheduleStrings),
					null,
					await createDefaultKeyboard(undefined, ctx),
				);
				ctx.scene.enter(sceneNames.default);
				break;
			}
			case botCommands.checkTimeTillNextCall.toLowerCase(): {
				if (!isTodaySunday()) {
					const { School } = ctx.session;
					const currentWeekDay = new Date().getDay();
					const callSchedule = await DataBase.getCallCheduleForDay(
						School,
						currentWeekDay,
					);

					const nextCallTimeString = DataBase.getNextCallTime(callSchedule, new Date());
					const currentTimeString = getTimeFromDate(new Date());

					if (currentTimeString > nextCallTimeString) {
						ctx.reply(
							'Последний звонок уже прозвенел',
							null,
							await createDefaultKeyboard(undefined, ctx),
						);
					} else {
						const diffInMinutes = getDiffBetweenTimesInMinutes(
							nextCallTimeString,
							currentTimeString,
						);

						ctx.reply(
							`До звонка ${diffInMinutes} минут`,
							null,
							await createDefaultKeyboard(undefined, ctx),
						);
					}
				} else {
					ctx.reply('Сегодня воскресенье, какие звонки? Только чилл');
				}

				ctx.scene.enter(sceneNames.default);
				break;
			}
			default: {
				ctx.reply(botCommands.notUnderstood);
			}
		}

		cleanDataForSceneFromSession(ctx);
	},
);

module.exports = callsScene;
