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

const DataBase = new DB(process.env.MONGODB_URI);

const { button } = Markup;

const callsScene = new Scene(
	sceneNames.calls,
	(ctx) => {
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
				const Class = await DataBase.getClassForStudent(ctx.message.user_id);
				let callSchedule;

				if (isTodaySunday()) {
					const callScheduleData = await DataBase.getCallSchedule(Class.schoolName);
					callSchedule = callScheduleData.defaultSchedule;
				} else {
					callSchedule = await DataBase.getCallCheduleForDay(
						Class.schoolName,
						new Date().getDay(),
					);
				}

				const callScheduleStrings = callSchedule.map(
					({ start, end }, i) => `${start} - ${end}`,
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
					const Class = await DataBase.getClassForStudent(ctx.message.user_id);
					const callSchedule = await DataBase.getCallCheduleForDay(
						Class.schoolName,
						new Date().getDay(),
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
					ctx.reply('Сегодня воскресенье, никаких уроков, только чилл');
				}
				ctx.scene.enter(sceneNames.default);
				break;
			}
			default: {
				ctx.reply(botCommands.notUnderstood);
			}
		}
	},
);

module.exports = callsScene;
