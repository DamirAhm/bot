//@ts-check
const { capitalize } = require('../utils/translits.js');
const Scene = require('node-vk-bot-api/lib/scene'),
	{ createDefaultKeyboard, createBackKeyboard } = require('../utils/messagePayloading.js'),
	{ DataBase: DB } = require('bot-database'),
	botCommands = require('../utils/botCommands.js'),
	Markup = require('node-vk-bot-api/lib/markup'),
	DataBase = new DB(process.env.MONGODB_URI),
	{
		cleanDataForSceneFromSession,
		sendStudentInfo,
		parseTime,
		getSchoolName,
	} = require('../utils/functions.js');
const {
	disableNotificationsAction,
	enableNotificationsAction,
	changeNotificationTimeAction,
	changeSchoolAction,
	changeClassAction,
	enterDayIndexesAction,
} = require('../utils/actions');

const changables = {
	class: 'class',
	notificationTime: 'notificationTime',
	notificationsEnabled: 'notificationsEnabled',
	daysForNotification: 'daysForNotification',
	school: 'school',
	city: 'city',
};
const timeRegExp = /[0-9]+:[0-9]+/;

const settingsScene = new Scene(
	'settings',
	async (ctx) => {
		try {
			const Student = await DataBase.getStudentByVkId(ctx.message.user_id);

			if (Student) {
				ctx.session.Student = Student;
				ctx.scene.next();
				await sendStudentInfo(ctx);
			} else {
				ctx.scene.enter('start');
			}
		} catch (e) {
			console.error(e);
			ctx.scene.enter('error');
		}
	},
	(ctx) => {
		try {
			const {
				message: { body },
			} = ctx;

			if (body === botCommands.changeSettings || /изменить/i.test(body)) {
				ctx.scene.next();
				ctx.reply(
					'Что вы хотите изменить?',
					null,
					createBackKeyboard([
						ctx.session.Student.settings.notificationsEnabled
							? [
									Markup.button(botCommands.disableNotifications, 'primary'),
									Markup.button(botCommands.changeNotificationTime, 'primary'),
							  ]
							: [Markup.button(botCommands.enbleNotifications, 'primary')],
						[
							Markup.button(botCommands.changeClass, 'primary'),
							Markup.button(botCommands.changeDaysForNotification, 'primary'),
						],
						[Markup.button(botCommands.changeSchool, 'primary')],
					]),
				);
			} else if (body === botCommands.back) {
				ctx.scene.enter('default');
			} else {
				ctx.reply(botCommands.notUnderstood);
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

			switch (body.toLowerCase()) {
				case botCommands.disableNotifications.toLowerCase(): {
					await disableNotificationsAction(ctx);
					break;
				}
				case botCommands.enbleNotifications.toLowerCase(): {
					await enableNotificationsAction(ctx);
					break;
				}
				case botCommands.changeNotificationTime.toLowerCase(): {
					changeNotificationTimeAction(ctx);
					break;
				}
				case botCommands.changeSchool.toLowerCase(): {
					changeSchoolAction(ctx);
					break;
				}
				case botCommands.changeClass.toLowerCase(): {
					changeClassAction(ctx);
					break;
				}
				case botCommands.changeDaysForNotification.toLowerCase(): {
					enterDayIndexesAction(ctx);
					break;
				}
				case botCommands.back.toLowerCase(): {
					ctx.scene.selectStep(1);
					await sendStudentInfo(ctx);
					break;
				}
				default: {
					ctx.reply(botCommands.notUnderstood);
					break;
				}
			}
		} catch (e) {
			console.error(e);
			ctx.scene.enter('error');
		}
	},
	async (ctx) => {
		try {
			let {
				message: { body },
			} = ctx;

			body = body.replace(/\./g, ':');

			if (body === botCommands.back) {
				ctx.scene.selectStep(2);
				ctx.reply(
					'Что вы хотите изменить?',
					null,
					createBackKeyboard([
						[
							Markup.button(botCommands.disableNotifications),
							Markup.button(botCommands.changeNotificationTime),
						],
					]),
				);

				return;
			} else if (ctx.session.changed) {
				switch (ctx.session.changed) {
					case changables.notificationTime: {
						body = body.replace(/\./g, ':');
						if (timeRegExp.test(body)) {
							const [hrs, mins] = parseTime(body);

							if (hrs >= 0 && hrs < 24 && mins >= 0 && mins < 60) {
								const res = await DataBase.changeSettings(ctx.message.user_id, {
									notificationTime: body,
								});

								if (res) {
									ctx.reply(
										'Время получения уведомлений успешно изменено на ' + body,
										null,
										await createDefaultKeyboard(undefined, ctx),
									);
									setTimeout(async () => {
										ctx.scene.enter('default');
									}, 50);
								} else {
									ctx.scene.enter('default');
									ctx.reply(
										'Простите не удалось изменить настройки, попробуйте позже',
										null,
										await createDefaultKeyboard(undefined, ctx),
									);
								}
							} else {
								ctx.reply(
									'Проверьте правильность введенного времени, оно должно быть в формате ЧЧ:ММ',
								);
							}
						} else {
							ctx.reply(
								'Проверьте правильность введенного времени, оно должно быть в формате ЧЧ:ММ',
							);
						}
						break;
					}
					case changables.class: {
						if (ctx.session.Class) {
							const res = await DataBase.changeClass(
								ctx.message.user_id,
								ctx.session.Class,
								await getSchoolName(ctx),
							);

							if (res) {
								ctx.reply(
									`Класс успешно изменен на ${ctx.session.Class.name}`,
									null,
									await createDefaultKeyboard(undefined, ctx),
								);
								setTimeout(() => {
									ctx.scene.enter('default');
								}, 50);
							} else {
								ctx.reply(
									`К сожалению не удалось сменить класс`,
									null,
									await createDefaultKeyboard(undefined, ctx),
								);

								changeClassAction(ctx);
							}
						} else {
							ctx.reply(
								`Не удалось сменить класс на ${ctx.session.Class.name}`,
								null,
								await createDefaultKeyboard(undefined, ctx),
							);

							changeClassAction(ctx);
						}
						break;
					}
					case changables.school: {
						if (ctx.session.Class && ctx.session.schoolName) {
							const res = await DataBase.changeClass(
								ctx.message.user_id,
								ctx.session.Class,
								ctx.session.schoolName,
							);

							if (res) {
								ctx.reply(
									`Школа успешно изменена на ${capitalize(
										ctx.session.schoolNumber,
									)} ${
										ctx.session.changedCity
											? `школу города ${ctx.session.cityName}`
											: ''
									}`,
									null,
									await createDefaultKeyboard(undefined, ctx),
								);
								setTimeout(() => {
									ctx.scene.enter('default');
								}, 50);
							} else {
								ctx.reply(
									`К сожалению не удалось сменить школу`,
									null,
									await createDefaultKeyboard(undefined, ctx),
								);

								changeClassAction(ctx);
							}
						} else {
							ctx.reply(
								`Не удалось сменить школу на ${ctx.session.Class.name}`,
								null,
								await createDefaultKeyboard(undefined, ctx),
							);

							changeClassAction(ctx);
						}
						break;
					}
					case changables.daysForNotification: {
						const { enteredDayIndexes } = ctx.session;

						const res = await DataBase.changeSettings(ctx.message.user_id, {
							daysForNotification: enteredDayIndexes,
						});

						if (res) {
							ctx.reply(
								`Дни оповещений успешно изменены на ${enteredDayIndexes.join(
									', ',
								)}`,
								null,
								await createDefaultKeyboard(undefined, ctx),
							);
							setTimeout(() => {
								ctx.scene.enter('default');
							}, 50);
						} else {
							ctx.reply(
								`К сожалению не удалось сменить дни оповещений, попробуйте позже`,
								null,
								await createDefaultKeyboard(undefined, ctx),
							);
							ctx.scene.enter('default');
						}
						break;
					}
				}
			} else {
				throw new Error('Ничего не изменилось ¯_(ツ)_/¯');
			}

			cleanDataForSceneFromSession(ctx);
		} catch (e) {
			console.error(e);
			ctx.scene.enter('error');
		}
	},
);

module.exports = settingsScene;
