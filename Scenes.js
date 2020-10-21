const path = require('path');
const Scene = require('node-vk-bot-api/lib/scene'),
	config = require('./config.js'),
	{
		renderAdminMenu,
		renderAdminMenuKeyboard,
		createDefaultMenu,
		createDefaultKeyboard,
		renderContributorMenu,
		renderContributorMenuKeyboard,
		lessonsList,
		parseAttachmentsToVKString,
		mapListToMessage,
		createContentDiscription,
		createConfirmKeyboard,
		createUserInfo,
		createBackKeyboard,
		monthsRP,
		notifyAllInClass,
		createDefaultKeyboardSync,
	} = require('./utils/messagePayloading.js'),
	{ DataBase: DB } = require('bot-database'),
	{
		findNextLessonDate,
		findNextDayWithLesson,
		mapHomeworkByLesson,
		dayInMilliseconds,
	} = require('bot-database/utils/functions'),
	botCommands = require('./utils/botCommands.js'),
	{ Roles, Lessons, daysOfWeek } = require('bot-database/Models/utils.js'),
	VK_API = require('bot-database/VkAPI/VK_API.js'),
	Markup = require('node-vk-bot-api/lib/markup'),
	DataBase = new DB(config['MONGODB_URI']),
	vk = new VK_API([config['VK_API_KEY'], config['GROUP_ID'], config['ALBUM_ID']]),
	{
		getTomorrowDate,
		isToday,
		findMaxPhotoResolution,
		filterContentByDate,
		inRange,
		sendHomework,
		getHomeworkPayload,
		getDayMonthString,
		cleanDataForSceneFromSession,
		cleanSession,
		calculateColumnsAmount,
		mapListToKeyboard,
		isValidClassName,
		parseSchoolName,
		retranslit,
		capitalize,
		translit,
		isValidCityName,
	} = require('./utils/functions.js'),
	fs = require('fs');

const maxDatesPerMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const changables = {
	class: 'class',
	notificationTime: 'notificationTime',
	notificationsEnabled: 'notificationsEnabled',
	daysForNotification: 'daysForNotification',
	school: 'school',
	city: 'city',
};

const isAdmin = async (ctx) => {
	let role = await DataBase.getRole(ctx.message.user_id);

	return role === Roles.admin;
};
const isContributor = async (ctx) => {
	let role = await DataBase.getRole(ctx.message.user_id);

	return [Roles.admin, Roles.contributor].includes(role);
};

const dateRegExp = /[0-9]+\.[0-9]+(\.[0-9])?/;
const timeRegExp = /[0-9]+:[0-9]+/;

module.exports.errorScene = new Scene('error', async (ctx) => {
	const Student = await DataBase.getStudentByVkId(ctx.message.user_id);

	if (Student && Student.registered) {
		ctx.reply('Простите произошла ошибка', null, await createDefaultKeyboard(undefined, ctx));
		ctx.scene.enter('default');
	} else {
		ctx.reply('Простите произошла ошибка');

		setTimeout(() => {
			ctx.scene.enter('register');
		}, 75);
	}
});

module.exports.startScene = new Scene('start', async (ctx) => {
	ctx.reply(
		`Привет ${ctx.session.firstName} ${ctx.session.secondName}`,
		null,
		await createDefaultKeyboard(undefined, ctx),
	);
	ctx.scene.enter('default');
});

module.exports.registerScene = new Scene(
	'register',
	async (ctx) => {
		ctx.scene.next();
		ctx.reply(
			'Введите название города в котором вы учитесь',
			null,
			Markup.keyboard([Markup.button(botCommands.checkExisting)]),
		);
	},
	async (ctx) => {
		try {
			let { body } = ctx.message;
			if (body.toLowerCase() === botCommands.checkExisting.toLowerCase()) {
				const cityNames = await getCityNames();

				ctx.session.cityNames = cityNames;

				ctx.reply(
					'Выберите свой город\n' + mapListToMessage(cityNames.map(capitalize)),
					null,
					mapListToKeyboard(cityNames.map(capitalize)),
				);
			} else if (/([a-z]|[а-я]|\d)+/i.test(body)) {
				const cityNames = await getCityNames();

				if (/([a-z]|[а-я])+/i.test(body) || (!isNaN(+body) && +body <= cityNames.length)) {
					let cityName;

					if (!isNaN(+body)) cityName = cityNames[+body - 1];
					else cityName = body.toLowerCase();
					ctx.session.cityName = cityName;

					ctx.scene.next();
					ctx.reply(
						'Введите номер школы в которой вы учитесь',
						null,
						createBackKeyboard(
							cityNames.includes(cityName.toLowerCase())
								? [[Markup.button(botCommands.checkExisting)]]
								: [],
						),
					);
				} else {
					ctx.reply('Введите название русскими или английскими буквами или цифру города');
				}
			} else {
				ctx.reply('Введите название русскими или английскими буквами');
			}
		} catch (e) {
			console.error(e);
			ctx.scene.enter('error');
		}
	},
	async (ctx) => {
		try {
			const { body } = ctx.message;

			if (body.toLowerCase() === botCommands.back.toLowerCase()) {
				ctx.scene.selectStep(1);
				ctx.reply(
					'Введите название города в котором вы учитесь',
					null,
					Markup.keyboard([Markup.button(botCommands.checkExisting)]),
				);
				return;
			}

			if (body.toLowerCase() === botCommands.checkExisting.toLowerCase()) {
				const schoolNumbers = await getSchoolNumbers(translit(ctx.session.cityName));

				if (schoolNumbers.length) {
					ctx.reply(
						'Выберите свою школу\n' + schoolNumbers.join('\n'),
						null,
						mapListToKeyboard(schoolNumbers, {
							trailingButtons: [[Markup.button(botCommands.back, 'negative')]],
						}),
					);
				} else {
					ctx.reply(
						'В вашем городе не создано еще ни одной школы ¯_(ツ)_/¯',
						null,
						createBackKeyboard(),
					);
				}
			} else if (/(\d)+/i.test(body)) {
				const schoolNumbers = await getSchoolNumbers(translit(ctx.session.cityName));
				if (!isNaN(+body)) {
					const schoolNumber = body;

					if (!schoolNumbers.includes(schoolNumber)) {
						const newSchool = await DataBase.createSchool(
							`${translit(ctx.session.cityName)}:${body}`,
						);

						if (newSchool) {
							ctx.session.schoolNumber = body;
							ctx.session.schoolName = `${translit(ctx.session.cityName)}:${body}`;
						} else {
							throw new Error(
								'Не удалось создать школу ' +
									`${translit(ctx.session.cityName)}:${body}\n` +
									JSON.stringify(newSchool),
							);
						}
					} else {
						ctx.session.schoolNumber = body;
						ctx.session.schoolName = `${translit(ctx.session.cityName)}:${body}`;
					}

					const classes = await DataBase.getClassesForSchool(ctx.session.schoolName);

					ctx.scene.next();
					ctx.reply(
						'Введите имя класса в котором вы учитесь',
						null,
						createBackKeyboard(
							classes.length > 0 ? [[Markup.button(botCommands.checkExisting)]] : [],
						),
					);
				} else {
					ctx.reply('Введите номер школы цифрами');
				}
			} else {
				ctx.reply('Введите номер школы цифрами');
			}
		} catch (e) {
			console.error(e);
			ctx.scene.enter('error');
		}
	},
	async (ctx) => {
		try {
			const {
				message: { body, user_id },
			} = ctx;

			if (body.toLowerCase() === botCommands.back.toLowerCase()) {
				const cityNames = await getCityNames();

				ctx.scene.selectStep(2);
				ctx.reply(
					'Введите номер школы в которой вы учитесь',
					null,
					createBackKeyboard(
						cityNames.includes(ctx.session.cityName.toLowerCase())
							? [[Markup.button(botCommands.checkExisting)]]
							: [],
					),
				);
				return;
			}

			if (body === botCommands.checkExisting) {
				const classNames = await DataBase.getAllClasses(
					ctx.session.schoolName,
				).then((classes) => classes.map((Class) => (Class ? Class.name : null)));

				if (classNames.length > 0) {
					ctx.session.classNames = classNames;

					ctx.reply(
						mapListToMessage(classNames),
						null,
						classNames.length <= 40 ? mapListToKeyboard(classNames) : null,
					);
				} else {
					ctx.reply(
						'В вашей школе не создано еще ни одного класса ¯_(ツ)_/¯',
						null,
						createBackKeyboard(),
					);
				}
				return;
			}

			let spacelessClassName;

			if (!isNaN(+body) && ctx.session.classNames)
				spacelessClassName = ctx.session.classNames[+body - 1].toUpperCase();
			else spacelessClassName = body.replace(/\s*/g, '').toUpperCase();
			if (isValidClassName(spacelessClassName)) {
				const Class = await DataBase.getClassByName(
					spacelessClassName,
					ctx.session.schoolName,
				);

				if (Class) {
					//! Убрал имя школы из схемы ученика
					await DataBase.createStudent(ctx.message.user_id, {
						firstName: ctx.session.firstName,
						lastName: ctx.session.lastName,
						class_id: Class._id,
						registered: true,
					});

					if (Class.schedule.every((day) => day.length === 0)) {
						ctx.scene.next();
						ctx.reply(
							'Вы хотите заполнить расписание для вашего класса?',
							null,
							createConfirmKeyboard(),
						);
					} else {
						ctx.reply(
							`Вы успешно зарегестрированны в ${spacelessClassName} классе ${ctx.session.schoolNumber} школы, города ${ctx.session.cityName}`,
							null,
							await createDefaultKeyboard(undefined, ctx),
						);
						ctx.scene.enter('default');
						cleanDataForSceneFromSession(ctx);
					}
				} else {
					const newClass = await DataBase.createClass(
						spacelessClassName,
						ctx.session.schoolName,
					);

					if (newClass) {
						await DataBase.addStudentToClass(
							user_id,
							spacelessClassName,
							ctx.session.schoolName,
						);

						ctx.scene.next();
						ctx.reply(
							'Вы хотите заполнить расписание для вашего класса?',
							null,
							createConfirmKeyboard(),
						);
					} else {
						throw new Error(`Can't create class with name ${spacelessClassName}`);
					}
				}
			} else {
				ctx.reply('Неверное имя класса');
			}
		} catch (e) {
			console.error(e);
			ctx.scene.enter('error');
		}
	},
	async (ctx) => {
		try {
			const { body } = ctx.message;

			if (body.toLowerCase() === botCommands.yes.toLowerCase()) {
				cleanDataForSceneFromSession(ctx);
				ctx.scene.enter('changeSchedule');
			} else if (body.toLowerCase() === botCommands.no.toLowerCase()) {
				const {
					class: { name: className },
				} = await DataBase.populate(await DataBase.getStudentByVkId(ctx.message.user_id));

				ctx.reply(
					`Вы успешно зарегестрированны в ${className} классе ${ctx.session.schoolNumber} школы, города ${ctx.session.cityName}`,
					null,
					await createDefaultKeyboard(undefined, ctx),
				);
				ctx.scene.enter('default');
				cleanDataForSceneFromSession(ctx);
			} else {
				ctx.reply(botCommands.notUnderstood);
			}
		} catch (e) {
			console.error(e);
			ctx.scene.enter('error');
		}
	},
);

module.exports.defaultScene = new Scene(
	'default',
	async (ctx) => {
		try {
			if (!ctx.session.userId) {
				ctx.session.userId = ctx.message.user_id;
			}
			ctx.reply(
				await createDefaultMenu(ctx.message.user_id),
				null,
				await createDefaultKeyboard(undefined, ctx),
			);

			ctx.scene.next();
		} catch (e) {
			ctx.scene.enter('error');
			console.error(e);
		}
	},
	async (ctx) => {
		try {
			switch (ctx.message.body) {
				case botCommands.adminPanel: {
					ctx.scene.enter('adminPanel');
					break;
				}
				case botCommands.contributorPanel: {
					ctx.scene.enter('contributorPanel');
					break;
				}
				case botCommands.checkHomework: {
					ctx.scene.enter('checkHomework');
					break;
				}
				case botCommands.checkAnnouncements: {
					ctx.scene.enter('checkAnnouncements');
					break;
				}
				case botCommands.checkSchedule: {
					ctx.scene.enter('checkSchedule');
					break;
				}
				case botCommands.settings: {
					ctx.scene.enter('settings');
					break;
				}
				case botCommands.giveFeedback: {
					ctx.scene.enter('giveFeedback');
					break;
				}
				case '1': {
					ctx.scene.enter('checkHomework');
					break;
				}
				case '2': {
					ctx.scene.enter('checkAnnouncements');
					break;
				}
				case '3': {
					ctx.scene.enter('checkSchedule');
					break;
				}
				case '4': {
					ctx.scene.enter('settings');
					break;
				}
				case '5': {
					ctx.scene.enter('giveFeedback');
				}
				default: {
					ctx.reply(botCommands.notUnderstood);
				}
			}
		} catch (e) {
			ctx.scene.enter('error');
			console.error(e);
		}
	},
);
module.exports.checkSchedule = new Scene(
	'checkSchedule',
	(ctx) => {
		ctx.scene.next();
		ctx.reply(
			'Вы хотите получить расписание только на сегодня или на всю неделю?',
			null,
			createBackKeyboard([
				[
					Markup.button(botCommands.onToday, 'primary'),
					Markup.button(botCommands.onAllWeek, 'positive'),
				],
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

					if (body.toLowerCase() === botCommands.onToday.toLowerCase()) {
						const message = getDayScheduleString(
							Class.schedule[new Date().getDay() - 1],
							daysOfWeek[new Date().getDay() - 1],
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
module.exports.checkHomework = new Scene(
	'checkHomework',
	async (ctx) => {
		try {
			if (ctx.message.body.toLowerCase() === botCommands.back.toLowerCase()) {
				ctx.scene.enter('default');
				return;
			}

			const needToPickClass = await isAdmin(ctx);
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
							'На какую дату вы хотите узнать задание? (в формате ДД.ММ .ГГГГ если не на этот год )',
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
					setTimeout(() => {
						const dayOfHomework = startDay + i;
						const dateItMilliseconds = new Date(
							today.getFullYear(),
							today.getMonth(),
							dayOfHomework,
						);
						const date = new Date(dateItMilliseconds);

						const dateString = getDayMonthString(date);

						const homework = filterContentByDate(ctx.session.Class.homework, date);

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
					ctx.reply('Дата должна быть в формате ДД.ММ .ГГГГ если не на этот год');
					return;
				}

				if (date) {
					const homework = filterContentByDate(ctx.session.Class.homework, date);
					if (homework.length === 0) {
						ctx.reply('На данный день не заданно ни одного задания');
						ctx.scene.enter('default');
					} else {
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
module.exports.checkAnnouncements = new Scene(
	'checkAnnouncements',
	async (ctx) => {
		try {
			const needToPickClass = await isAdmin(ctx);

			if (ctx.message.body.toLowerCase() === botCommands.back.toLowerCase()) {
				ctx.scene.enter('default');
				return;
			}

			if (needToPickClass && !ctx.session.Class) {
				ctx.session.nextScene = 'checkAnnouncements';
				ctx.session.pickFor = 'Выберите класс у которого хотите посмотреть обьявления \n';
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
							'На какую дату вы хотите узнать объявления? (в формате ДД.ММ .ГГГГ если не на этот год)',
							null,
							createBackKeyboard([
								[
									Markup.button(botCommands.onToday, 'positive'),
									Markup.button(botCommands.onTomorrow, 'positive'),
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
					ctx.scene.enter('checkAnnouncements');
				} else {
					ctx.scene.enter('default');
				}
				return;
			}

			let date = null;

			if (body === botCommands.onToday) {
				date = new Date();
			} else if (body === botCommands.onTomorrow) {
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
				ctx.reply('Дата должна быть в формате ДД.ММ .ГГГГ если не на этот год');
				return;
			}

			if (date) {
				const announcements = filterContentByDate(ctx.session.Class.announcements, date);
				if (announcements.length === 0) {
					ctx.reply('На данный день нет ни одного объявления');
					ctx.scene.enter('default');
				} else {
					let message = `Объявления на ${date.getDate()} ${monthsRP[date.getMonth()]}\n`;

					let attachments = [];
					for (let i = 0; i < announcements.length; i++) {
						const announcement = announcements[i];
						message += announcement.text ? `${i + 1}: ${announcement.text}\n` : '';
						attachments = attachments.concat(
							announcement.attachments?.map(({ value }) => value),
						);
					}

					ctx.reply(message, attachments);

					ctx.scene.enter('default');
				}
			} else {
				throw new Error("There's no date");
			}

			cleanDataForSceneFromSession(ctx);
		} catch (e) {
			console.error(e);
			ctx.scene.enter('error');
		}
	},
);

module.exports.settings = new Scene(
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
								ctx.session.Class.name,
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
								ctx.session.Class.name,
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

module.exports.giveFeedback = new Scene(
	'giveFeedback',
	(ctx) => {
		ctx.scene.next();

		ctx.reply(
			'Что вы хотите сказать о нашем боте?',
			null,
			createBackKeyboard([[Markup.button('Мне все нравится, спасибо 😊', 'positive')]]),
		);
	},
	(ctx) => {
		const {
			message: { body, user_id },
		} = ctx;

		fs.readFile(path.join(__dirname, 'Feedback'), { encoding: 'utf8' }, (err, text) => {
			if (err) {
				throw err;
			}

			const newText = text + `${body} (${user_id}) \n`;

			fs.writeFile(
				path.join(__dirname, 'Feedback'),
				newText,
				{ encoding: 'utf8' },
				async (err) => {
					if (err) {
						throw err;
					}

					const adminsIds = await DataBase.getAllStudents()
						.then((students) => students.filter(({ role }) => role === Roles.admin))
						.then((admins) => admins.map(({ vkId }) => vkId));

					if (!adminsIds.some((id) => id === ctx.message.user_id)) {
						const notificationMessage = `Новый отзыв: \n` + `${body} (${user_id}) \n`;

						ctx.bot.sendMessage(adminsIds, notificationMessage);
					}

					ctx.reply(
						'Спасибо за отзыв',
						null,
						await createDefaultKeyboard(undefined, ctx),
					);
					ctx.scene.enter('default');
				},
			);
		});
	},
);

module.exports.adminPanel = new Scene(
	'adminPanel',
	async (ctx) => {
		if (await isAdmin(ctx)) {
			ctx.scene.next();
			ctx.reply(renderAdminMenu(), null, renderAdminMenuKeyboard());
		} else {
			ctx.scene.leave();
			ctx.reply(
				'Ты не админ чтоб такое делать',
				null,
				await createDefaultKeyboard(undefined, ctx),
			);
		}
	},
	async (ctx) => {
		try {
			if (['0', botCommands.back].includes(ctx.message.body.trim())) {
				ctx.scene.enter('default');
				return;
			}

			switch (ctx.message.body.trim()) {
				case '1': {
					ctx.scene.enter('removeRedactor');
					break;
				}
				case '2': {
					const Contributors = await DataBase.getAllContributors(
						await getSchoolName(ctx),
					);

					if (Contributors.length > 0) {
						const classesStr = mapListToMessage(mapStudentToPreview(Contributors));

						const message = 'Список всех редакторов\n\t' + classesStr;

						ctx.reply(message, null, await createDefaultKeyboard(true));
					} else {
						ctx.reply(
							'Не существует ни одного редактора',
							null,
							await createDefaultKeyboard(true),
						);
					}
					ctx.scene.enter('default');
					break;
				}
				case '3': {
					ctx.scene.enter('addClass');
					break;
				}
				case '4': {
					const Classes = await DataBase.getAllClasses(await getSchoolName(ctx));

					if (Classes.length > 0) {
						const classesStr = mapListToMessage(
							Classes.map((Class) => (Class ? Class.name : null)),
						);

						const message = 'Список всех классов\n\t' + classesStr;

						ctx.reply(message, null, await createDefaultKeyboard(true, false));
					} else {
						ctx.reply(
							'Не существует ни одного класса',
							null,
							await createDefaultKeyboard(true, false),
						);
					}
					ctx.scene.enter('default');
					break;
				}
				case botCommands.removeRedactor: {
					ctx.scene.enter('removeRedactor');
					break;
				}
				case botCommands.redactorsList: {
					ctx.scene.enter('redactorsList');
					break;
				}
				case botCommands.addClass: {
					ctx.scene.enter('addClass');
					break;
				}
				case botCommands.classList: {
					ctx.scene.enter('classList');
					break;
				}
				default: {
					ctx.reply(botCommands.notUnderstood);
					break;
				}
			}
		} catch (e) {
			ctx.scene.leave();
			ctx.reply('Простите произошла ошибка', null, await createDefaultKeyboard(true, false));
			console.error(e);
		}
	},
);
module.exports.classList = new Scene('classList', async (ctx) => {
	const Classes = await DataBase.getAllClasses(await getSchoolName(ctx));

	if (Classes.length > 0) {
		const classesStr = mapListToMessage(Classes.map((Class) => (Class ? Class.name : null)));

		const message = 'Список всех классов\n\t' + classesStr;

		ctx.reply(message, null, await createDefaultKeyboard(true, false));
	} else {
		ctx.reply('Не существует ни одного класса', null, await createDefaultKeyboard(true, false));
	}
	ctx.scene.enter('default');
});
module.exports.redactorsList = new Scene('redactorsList', async (ctx) => {
	const Contributors = await DataBase.getAllContributors(await getSchoolName(ctx));

	if (Contributors.length > 0) {
		const classesStr = mapListToMessage(mapStudentToPreview(Contributors));

		const message = 'Список всех редакторов\n\t' + classesStr;

		ctx.reply(message, null, await createDefaultKeyboard(true));
	} else {
		ctx.reply('Не существует ни одного редактора', null, await createDefaultKeyboard(true));
	}

	ctx.scene.enter('default');
});
module.exports.addRedactor = new Scene(
	'addRedactor',
	async (ctx) => {
		const role = await DataBase.getRole(ctx.message.user_id);

		if ([Roles.admin, Roles.contributor].includes(role)) {
			ctx.reply(
				'Введите id пользователя, которого хотите сделать редактором',
				null,
				createBackKeyboard(),
			);
			ctx.scene.next();
		} else {
			ctx.reply(
				'У вас нет прав что бы добавлять редакторов',
				null,
				createDefaultKeyboardSync(role),
			);
			ctx.scene.enter('default');
		}
	},
	async (ctx) => {
		try {
			if (ctx.message.body.trim() === botCommands.back) {
				ctx.scene.enter('default');
			}
			const {
				message: { body },
			} = ctx;
			const id = Number(body.trim());

			const role = await DataBase.getRole(ctx.message.user_id);

			if (!isNaN(id)) {
				let Student = await DataBase.getStudentByVkId(id);

				if (Student && Student.role === Roles.admin) {
					ctx.reply(
						'Пользователь уже является администратором',
						null,
						await createDefaultKeyboard(true, false),
					);
					ctx.scene.enter('default');
					return;
				} else if (Student && Student.role === Roles.contributor) {
					ctx.reply(
						'Пользователь уже является редактором',
						null,
						await createDefaultKeyboard(true, false),
					);
					ctx.scene.enter('default');
					return;
				}

				if (role === Roles.admin) {
					if (!Student) {
						const response = await vk.api('users.get', { user_ids: id });

						if (!response.error_code && response) {
							const { first_name, last_name } = response[0];
							Student = await DataBase.createStudent(id, {
								firstName: first_name,
								lastName: last_name,
								registered: false,
							});
						} else {
							throw new Error(JSON.stringify(response));
						}
					}

					await Student.updateOne({ role: Roles.contributor });

					ctx.reply(
						'Пользователь стал редактором',
						null,
						await createDefaultKeyboard(true, false),
					);
					ctx.scene.enter('default');
				} else if (role === Roles.contributor) {
					const { class: classId } = await DataBase.getStudentByVkId(ctx.message.user_id);
					if (Student && Student.class.toString() === classId.toString()) {
						await Student.updateOne({ role: Roles.contributor });

						ctx.reply(
							'Пользователь стал редактором',
							null,
							await createDefaultKeyboard(true, false),
						);
						ctx.scene.enter('default');
					} else {
						ctx.reply(
							'Что бы сделать пользователя редактором, он должен быть учеником вашего класса',
							null,
							await createDefaultKeyboard(true, false),
						);
						ctx.scene.enter('default');
					}
				}
			} else {
				ctx.reply('Неверный id');
			}
		} catch (e) {
			ctx.scene.leave();
			ctx.reply('Простите произошла ошибка', null, await createDefaultKeyboard(true, false));
			console.error(e);
		}
	},
);
module.exports.removeRedactor = new Scene(
	'removeRedactor',
	(ctx) => {
		ctx.reply(
			'Введите id пользователя, которого хотите лишить должности редактора',
			null,
			createBackKeyboard(),
		);
		ctx.scene.next();
	},
	async (ctx) => {
		try {
			if (ctx.message.body.trim() === botCommands.back) {
				ctx.scene.enter('default');
			}
			const {
				message: { body },
				scene: { leave, enter },
			} = ctx;
			const id = Number(body.trim());

			if (!isNaN(id)) {
				let Student = await DataBase.getStudentByVkId(id);

				if (Student && Student.role === Roles.admin) {
					ctx.reply(
						'Пользователя нельзя понизить в роли, так как он является администратором',
						null,
						await createDefaultKeyboard(true, false),
					);
					ctx.scene.enter('default');
					return;
				} else if (!Student || Student.role === Roles.student) {
					ctx.reply(
						'Пользователь уже не является редактором',
						null,
						await createDefaultKeyboard(true, false),
					);
					ctx.scene.enter('default');
					return;
				}

				Student.role = Roles.student;
				await Student.save();

				ctx.reply(
					'Пользователь перестал быть редактором',
					null,
					await createDefaultKeyboard(true, false),
				);
				ctx.scene.enter('default');
			} else {
				ctx.reply('Неверный id');
				ctx.scene.enter('removeRedactor');
			}
		} catch (e) {
			ctx.scene.leave();
			ctx.reply('Простите произошла ошибка', null, await createDefaultKeyboard(true, false));
			console.error(e);
		}
	},
);
module.exports.addClass = new Scene(
	'addClass',
	(ctx) => {
		ctx.reply('Введите имя класса (цифра буква)', null, createBackKeyboard());
		ctx.scene.next();
	},
	async (ctx) => {
		try {
			if (ctx.message.body.trim() === botCommands.back) {
				ctx.scene.enter('default');
			}
			const {
				message: { body },
				scene: { leave, enter },
			} = ctx;
			const spacelessClassName = body.replace(/\s*/g, '');
			if (/\d+([a-z]|[а-я])/i.test(spacelessClassName)) {
				const Class = await DataBase.createClass(
					spacelessClassName,
					await DataBase.getSchoolForStudent(ctx.message.user_id).then((School) =>
						School ? School.name : null,
					),
				);
				if (Class) {
					ctx.reply('Класс успешно создан');
					ctx.scene.enter('default');
				} else {
					ctx.reply('Создание класса не удалось');
				} //TODO исправить (вынести в функцию\превратить старт в сцену\еще что то)
			} else {
				enter('addClass');
				ctx.reply('Неправильный формат ввода (должна быть цифра и потом буква)');
			}
		} catch (err) {
			console.error(err);
			ctx.reply('Что то пошло не так попробуйте позже');
		}
	},
);

module.exports.contributorPanel = new Scene(
	'contributorPanel',
	async (ctx) => {
		if (await isContributor(ctx)) {
			ctx.reply(renderContributorMenu(), null, renderContributorMenuKeyboard());
			ctx.scene.next();
		} else {
			ctx.scene.leave();
			ctx.reply(
				'Ты не редактор чтоб такое делать',
				null,
				await createDefaultKeyboard(undefined, ctx),
			);
		}
	},
	async (ctx) => {
		try {
			if (['0', botCommands.back].includes(ctx.message.body.trim())) {
				ctx.scene.enter('default');
				return;
			}

			switch (ctx.message.body.trim().toLowerCase()) {
				case '1': {
					ctx.scene.enter('addHomework');
					break;
				}
				case '2': {
					ctx.scene.enter('addAnnouncement');
					break;
				}
				case '3': {
					ctx.scene.enter('changeSchedule');
					break;
				}
				case '4': {
					ctx.scene.enter('addRedactor');
					break;
				}
				case botCommands.addRedactor.toLowerCase(): {
					ctx.scene.enter('addRedactor');
					break;
				}
				case botCommands.addHomework.toLowerCase(): {
					ctx.scene.enter('addHomework');
					break;
				}
				case botCommands.addAnnouncement.toLowerCase(): {
					ctx.scene.enter('addAnnouncement');
					break;
				}
				case botCommands.changeSchedule.toLowerCase(): {
					ctx.scene.enter('changeSchedule');
					break;
				}
				default: {
					ctx.reply(botCommands.notUnderstood);
					break;
				}
			}
		} catch (e) {
			ctx.scene.leave();
			ctx.reply('Простите произошла ошибка', null, await createDefaultKeyboard(true, false));
			console.error(e);
		}
	},
);

module.exports.addHomework = new Scene(
	'addHomework',
	async (ctx) => {
		try {
			const needToPickClass = await isAdmin(ctx);
			if (needToPickClass && !ctx.session.Class) {
				ctx.session.nextScene = 'addHomework';
				ctx.session.pickFor = 'Выберите класс которому хотите добавить дз \n';
				ctx.session.backScene = 'contributorPanel';
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
							'Введите содержимое дз (можно прикрепить фото)',
							null,
							createBackKeyboard(),
						);
					} else {
						ctx.scene.enter('register');
						ctx.reply(
							'Сначала вам необходимо зарегестрироваться, введите имя класса в котором вы учитесь',
						);
					}
				} else {
					throw new Error(`User is not existing ${ctx.session.userId}`);
				}
			}
		} catch (e) {
			console.error(e);
			ctx.scene.enter('error');
		}
	},
	async (ctx) => {
		try {
			const { message } = ctx;

			if (message.body === botCommands.back) {
				const peekedClass = await isContributor(ctx);
				if (peekedClass) {
					ctx.scene.enter('contributorPanel');
				} else {
					ctx.scene.enter('default');
				}
				return;
			}

			const { body, attachments } = getTextsAndAttachmentsFromForwarded(message);

			if (attachments.every((att) => att.type === 'photo')) {
				const parsedAttachments = await mapAttachmentsToObject(attachments);

				ctx.session.newHomework = {
					text: body,
					attachments: parsedAttachments,
				};

				const possibleLessons = await getPossibleLessonsAndSetInSession(ctx);

				ctx.scene.next();
				ctx.reply('Выбирите урок:\n' + mapListToMessage(possibleLessons));
			} else {
				ctx.reply('Отправлять можно только фото');
			}
		} catch (e) {
			console.error(e);
			ctx.scene.enter('error');
		}
	},
	(ctx) => {
		try {
			let {
				message: { body },
			} = ctx;

			if (body === botCommands.back) {
				ctx.session.newHomework.attachment = undefined;
				ctx.session.newHomework.text = undefined;
				ctx.scene.selectStep(1);
				ctx.reply(
					'Введите содержимое дз (можно прикрепить фото)',
					null,
					createBackKeyboard(),
				);
			}

			if (!isNaN(+body) || ctx.session.possibleLessons.includes(body)) {
				const lesson = ctx.session.possibleLessons[+body - 1] || body;

				ctx.session.newHomework.lesson = lesson;

				ctx.scene.next();
				ctx.reply(
					'Введите дату на которую задано задание (в формате ДД.ММ .ГГГГ если не на этот год)',
					null,
					createBackKeyboard([Markup.button(botCommands.onNextLesson, 'positive')], 1),
				);
			} else {
				if (Lessons.includes(body)) {
					ctx.reply('Вы можете вводить только доступные уроки');
				} else {
					ctx.reply('Вы должны ввести цифру или название урока');
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

			if (body === botCommands.back) {
				ctx.session.newHomework.lesson = undefined;
				ctx.scene.selectStep(2);
				ctx.reply(
					'Выбирите урок:\n' + mapListToMessage(ctx.session.possibleLessons, 1),
					null,
					createBackKeyboard(),
				);
			}

			if (body === botCommands.onNextLesson) {
				const datePrediction = findNextLessonDate(
					findNextDayWithLesson(
						ctx.session.Class.schedule,
						ctx.session.newHomework.lesson,
						new Date().getDay() || 7,
					),
				);

				ctx.session.newHomework.to = datePrediction;
			} else if (dateRegExp.test(body)) {
				const [day, month, year = new Date().getFullYear()] = parseDate(body);

				if (validateDate(month, day, year)) {
					const date = new Date(year, month - 1, day);
					console.log(date, year, month, day);
					if (date.getTime() >= Date.now()) {
						ctx.session.newHomework.to = date;
					} else {
						ctx.reply('Дата не может быть в прошлом');
					}
				} else {
					ctx.reply('Проверьте правильность введенной даты');
				}
			} else {
				ctx.reply('Дата должна быть в формате ДД.ММ .ГГГГ если не на этот год');
				return;
			}

			if (ctx.session.newHomework.to) {
				ctx.scene.next();
				ctx.reply(
					`
                Вы уверены что хотите создать такое задание?
                ${createContentDiscription(ctx.session.newHomework)}
                `,
					ctx.session.newHomework.attachments.map(({ value }) => value),
					createConfirmKeyboard(),
				);
			} else {
				throw new Error("Threre's no to prop in new Homework");
			}
		} catch (e) {
			console.error(e);
			ctx.scene.enter('error');
		}
	},
	async (ctx) => {
		try {
			const {
				message: { body: answer },
			} = ctx;

			if (answer.trim().toLowerCase() === botCommands.yes.toLowerCase()) {
				const {
					newHomework: { to, lesson, text, attachments },
					Class: { name: className },
				} = ctx.session;
				ctx.session.Class = undefined;

				const res = await DataBase.addHomework(
					{
						className,
						schoolName: await getSchoolName(ctx),
					},
					lesson,
					{ text, attachments },
					ctx.message.user_id,
					to,
				);

				if (res) {
					ctx.reply(
						'Домашнее задание успешно создано',
						null,
						await createDefaultKeyboard(undefined, ctx),
					);
					ctx.scene.enter('default');
				} else {
					ctx.scene.enter('error');
				}
			} else if (ctx.message.body === botCommands.no) {
				ctx.scene.selectStep(3);
				ctx.reply(
					'Введите дату на которую задано задание (в формате ДД.ММ .ГГГГ если не на этот год)',
					null,
					createBackKeyboard([[Markup.button(botCommands.onNextLesson, 'positive')]]),
				);
			} else {
				ctx.reply('Ответьте да или нет');
			}

			cleanDataForSceneFromSession(ctx);
		} catch (e) {
			console.error(e);
			ctx.scene.enter('error');
		}
	},
);
module.exports.addAnnouncement = new Scene(
	'addAnnouncement',
	async (ctx) => {
		try {
			const needToPickClass = await isAdmin(ctx);
			if (needToPickClass && !ctx.session.Class) {
				ctx.session.nextScene = 'addAnnouncement';
				ctx.session.pickFor = 'Выберите класс у которому хотите добавить обьявление \n';
				ctx.session.backScene = 'contributorPanel';
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
							'Введите содержимое объявления (можно прикрепить фото)',
							null,
							createBackKeyboard(),
						);
					} else {
						ctx.scene.enter('register');
						ctx.reply(
							'Сначала вам необходимо зарегестрироваться, введите имя класса в котором вы учитесь',
						);
					}
				} else {
					throw new Error(`User is not existing ${ctx.session.userId}`);
				}
			}
		} catch (e) {
			console.error(e);
			ctx.scene.enter('error');
		}
	},
	async (ctx) => {
		try {
			const { message } = ctx;

			if (message.body === botCommands.back) {
				const peekedClass = await isAdmin(ctx);
				if (peekedClass) {
					ctx.scene.enter('contributorPanel');
				} else {
					ctx.scene.enter('default');
				}
				return;
			}

			const { body, attachments } = getTextsAndAttachmentsFromForwarded(message);

			if (attachments.every((att) => att.type === 'photo')) {
				const parsedAttachments = await mapAttachmentsToObject(attachments);

				ctx.session.newAnnouncement = { text: body, attachments: parsedAttachments };

				ctx.scene.next();
				ctx.reply(
					'Введите дату объявления (в формате ДД.ММ .ГГГГ если не на этот год)',
					null,
					createBackKeyboard([
						[
							Markup.button(botCommands.onToday, 'positive'),
							Markup.button(botCommands.onTomorrow, 'positive'),
						],
					]),
				);
			} else {
				ctx.reply('Отправлять можно только фото');
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

			if (body === botCommands.back) {
				ctx.session.newAnnouncement.lesson = undefined;
				ctx.scene.selectStep(1);
				ctx.reply(
					'Введите содержимое объявления (можно прикрепить фото)',
					null,
					createBackKeyboard(),
				);
				return;
			}

			if (body === botCommands.onToday) {
				ctx.session.newAnnouncement.to = new Date();
			} else if (body === botCommands.onTomorrow) {
				ctx.session.newAnnouncement.to = getTomorrowDate();
			} else if (dateRegExp.test(body)) {
				const [day, month, year = new Date().getFullYear()] = parseDate(body);

				if (validateDate(month, day, year)) {
					const date = new Date(year, month - 1, day);

					if (date.getTime() >= Date.now()) {
						ctx.session.newAnnouncement.to = date;
					} else {
						ctx.reply('Дата не может быть в прошлом');
					}
				} else {
					ctx.reply('Проверьте правильность введенной даты');
				}
			} else {
				ctx.reply('Дата должна быть в формате ДД.ММ .ГГГГ если не на этот год');
				return;
			}

			if (ctx.session.newAnnouncement.to) {
				ctx.scene.next();
				ctx.reply(
					`Вы уверены что хотите создать такое изменение? \n ${createContentDiscription(
						ctx.session.newAnnouncement,
					)}`,
					ctx.session.newAnnouncement.attachments.map(({ value }) => value),
					createConfirmKeyboard(),
				);
			} else {
				throw new Error("There's no to prop in new announcement");
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

			if (body.trim().toLowerCase() === botCommands.yes.toLowerCase()) {
				const {
					newAnnouncement: { to, text, attachments },
					Class: { name: className },
				} = ctx.session;
				ctx.session.Class = undefined;

				const res = await DataBase.addAnnouncement(
					{
						className,
						schoolName: await getSchoolName(ctx),
					},
					{ text, attachments },
					to,
					false,
					ctx.message.user_id,
				);

				if (res) {
					ctx.reply(
						'Изменение в расписании успешно создано',
						null,
						await createDefaultKeyboard(undefined, ctx),
					);

					if (isToday(to)) {
						notifyAllInClass(
							ctx,
							className,
							`На сегодня появилось новое изменение в расписании:\n ${text}`,
							attachments,
						);
					}
				} else {
					ctx.scene.enter('error');
				}
			} else if (ctx.message.body.toLowerCase() === botCommands.no.toLowerCase()) {
				ctx.scene.selectStep(2);
				ctx.reply(
					'Введите дату объявления (в формате ДД.ММ .ГГГГ если не на этот год)',
					null,
					createBackKeyboard([
						[
							Markup.button(botCommands.onToday, 'positive'),
							Markup.button(botCommands.onTomorrow, 'positive'),
						],
					]),
				);
			} else {
				ctx.reply('Ответьте да или нет');
			}

			cleanDataForSceneFromSession(ctx);
		} catch (e) {
			console.error(e);
			ctx.scene.enter('error');
		}
	},
);
module.exports.changeSchedule = new Scene(
	'changeSchedule',
	async (ctx) => {
		ctx.session.isFullFill = false;
		ctx.session.changingDay = undefined;

		try {
			const needToPickClass = await isAdmin(ctx);
			if (needToPickClass && !ctx.session.Class) {
				ctx.session.nextScene = 'changeSchedule';
				ctx.session.pickFor = 'Выберите класс которому хотите изменить расписание \n';
				ctx.session.backScene = 'contributorPanel';
				ctx.scene.enter('pickClass');
			} else {
				const Student = await DataBase.getStudentByVkId(
					ctx.session.userId || ctx.message.user_id,
				);

				if (Student) {
					if (Student.registered) {
						let { Class } = ctx.session;
						if (!Class) Class = await DataBase.getClassBy_Id(Student.class);

						ctx.session.Class = Class;
						ctx.session.schedule = Class.schedule;

						const days = Object.values(daysOfWeek);
						const buttons = days.map((day, index) =>
							Markup.button(index + 1, 'default', { button: day }),
						);

						buttons.push(Markup.button('0', 'primary'));

						const message =
							'Выберите день у которого хотите изменить расписание\n' +
							mapListToMessage(days) +
							'\n0. Заполнить всё';

						ctx.scene.next();
						ctx.reply(message, null, createBackKeyboard(buttons));
					} else {
						ctx.scene.enter('register');
						ctx.reply(
							'Сначала вам необходимо зарегестрироваться, введите имя класса в котором вы учитесь',
						);
					}
				} else {
					throw new Error(`Student is not existing ${ctx.session.userId}`);
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

			if (body.toLowerCase === botCommands.back) {
				ctx.scene.enter('default');
			} else if (body.toLowerCase() === botCommands.back.toLowerCase()) {
				ctx.scene.enter('default');
				return;
			}

			if (
				['заполнить всё', 'все', '0', 'всё', 'заполнить всё'].includes(body.toLowerCase())
			) {
				ctx.session.isFullFill = true;
				ctx.session.changingDay = 1;
				const message = `
            		Введите новое расписание цифрами через запятую или пробел, выбирая из этих предметов\n
            		${lessonsList} \n
            		Сначала понедельник:
            	`;

				ctx.scene.next();
				ctx.reply(
					message,
					null,
					createBackKeyboard([Markup.button(botCommands.leaveEmpty, 'primary')], 1),
				);
			} else if (
				(!isNaN(+body) && +body >= 1 && +body <= 7) ||
				Object.values(daysOfWeek).includes(body)
			) {
				ctx.session.changingDay = +body;

				const message = `Введите новое расписание цифрами через запятую или пробел, выбирая из этих предметов\n ${lessonsList} `;

				ctx.scene.next();
				ctx.reply(
					message,
					null,
					createBackKeyboard([Markup.button(botCommands.leaveEmpty, 'primary')], 1),
				);
			} else {
				ctx.reply('Неверно введен день');
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

			if (body === botCommands.leaveEmpty) {
				body = '';
			} else if (body.toLowerCase() === botCommands.back.toLowerCase()) {
				const Student = await DataBase.getStudentByVkId(ctx.message.user_id);

				let { Class } = ctx.session;
				if (!Class) Class = await DataBase.getClassBy_Id(Student.class);

				ctx.session.Class = Class;
				ctx.session.schedule = Class.schedule;

				const days = Object.values(daysOfWeek);
				const buttons = days.map((day, index) =>
					Markup.button(index + 1, 'default', { button: day }),
				);

				buttons.push(Markup.button('0', 'primary'));

				const message =
					'Выберите день у которого хотите изменить расписание\n' +
					mapListToMessage(days) +
					'\n0. Заполнить всё';

				ctx.scene.selectStep(1);
				ctx.reply(message, null, createBackKeyboard(buttons));
				return;
			}

			body = body.replace(/,/g, ' ');

			let indexes = body.trim().split(' ').filter(Boolean);
			if (indexes.every((index) => !isNaN(+index))) {
				indexes = indexes.map((i) => +i);
				if (indexes.every((index) => index >= 0 && index < Lessons.length)) {
					const newLessons = indexes.map((i) => Lessons[i]);
					ctx.session.schedule[ctx.session.changingDay - 1] = newLessons;

					if (
						!ctx.session.isFullFill ||
						ctx.session.changingDay === Object.keys(daysOfWeek).length
					) {
						ctx.scene.next();

						const newScheduleStr = ctx.session.isFullFill
							? ctx.session.schedule.map(
									(lessons, i) =>
										`${daysOfWeek[i]}: \n ${mapListToMessage(lessons)} `,
							  )
							: mapListToMessage(newLessons);
						const isEmpty = ctx.session.isFullFill
							? ctx.session.schedule.every((lessons) => lessons.length === 0)
							: newLessons.length === 0;
						const message = !isEmpty
							? 'Вы уверены, что хотите изменить расписание на это:\n' +
							  newScheduleStr +
							  '?'
							: 'Вы уверены, что хотите оставить расписание пустым?';

						ctx.reply(message, null, createConfirmKeyboard());
					} else {
						ctx.session.changingDay++;
						ctx.scene.selectStep(2);
						ctx.reply(daysOfWeek[ctx.session.changingDay - 1] + ':');
					}
				} else {
					ctx.reply('Проверьте правильность введенного расписания');
				}
			} else {
				ctx.reply('Вы должны вводить только цифры');
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
			const { schedule, Class } = ctx.session;

			if (body.toLowerCase() === 'да') {
				if (schedule && Class) {
					await Class.updateOne({ schedule });
					ctx.scene.enter('default');
					ctx.reply(
						'Расписание успешно обновлено',
						null,
						await createDefaultKeyboard(true, false),
					);
				} else {
					throw new Error(
						'Schedule is ' +
							JSON.stringify(schedule) +
							'\nClass is ' +
							JSON.stringify(Class),
					);
				}
			} else {
				ctx.reply('Введите новое расписание');
				ctx.scene.selectStep(2);
			}

			cleanDataForSceneFromSession(ctx);
		} catch (e) {
			console.error(e);
			ctx.scene.enter('error');
		}
	},
);

module.exports.pickSchool = new Scene(
	'pickSchool',
	async (ctx) => {
		try {
			const keyboard = (await getSchoolName(ctx))
				? createConfirmKeyboard([[Markup.button(botCommands.back, 'negative')]])
				: Markup.keyboard([
						[Markup.button(botCommands.yes, 'positive')],
						[Markup.button(botCommands.back, 'negative')],
				  ]);

			ctx.scene.next();
			ctx.reply('Хотите ли вы поменять город?', null, keyboard);
		} catch (e) {
			console.error(e);
			ctx.scene.enter('error');
		}
	},
	async (ctx) => {
		try {
			const { body } = ctx.message;

			if (body.toLowerCase() === botCommands.back.toLowerCase()) {
				ctx.scene.enter(ctx.session.backScene ?? 'default', ctx.session.backStep ?? 0);
				return;
			}

			if (body.toLowerCase() === botCommands.yes.toLowerCase()) {
				ctx.session.changedCity = true;

				ctx.scene.selectStep(2);
				ctx.reply(
					'Введите название своего города',
					null,
					Markup.keyboard([
						[Markup.button(botCommands.checkExisting)],
						[Markup.button(botCommands.back, 'negative')],
					]),
				);
			} else if (body.toLowerCase() === botCommands.no.toLowerCase()) {
				ctx.session.cityName = retranslit(parseSchoolName(await getSchoolName(ctx))[0]);
				ctx.scene.selectStep(3);
				ctx.reply(
					'Введите номер своей школы',
					null,
					Markup.keyboard([
						[Markup.button(botCommands.checkExisting)],
						[Markup.button(botCommands.back, 'negative')],
					]),
				);
			} else {
				ctx.reply('Ответьте да или нет');
			}
		} catch (e) {
			console.error(e);
		}
	},
	async (ctx) => {
		try {
			let { body } = ctx.message;

			if (ctx.message.body === botCommands.back) {
				ctx.reply(
					'Хотите ли вы поменять город?',
					null,
					createConfirmKeyboard([[Markup.button(botCommands.back, 'negative')]]),
				);
				ctx.scene.selectStep(1);
				return;
			}

			if (body.toLowerCase() === botCommands.checkExisting.toLowerCase()) {
				const cityNames = await getCityNames();

				ctx.session.cityNames = cityNames;

				ctx.reply(
					'Выберите свой город\n' + mapListToMessage(cityNames.map(capitalize)),
					null,
					mapListToKeyboard(cityNames.map(capitalize), {
						trailingButtons: [[Markup.button(botCommands.back, 'negative')]],
					}),
				);
			} else if (/([a-z]|[а-я]|\d)+/i.test(body)) {
				const cityNames = await getCityNames();

				if (/([a-z]|[а-я])+/i.test(body) || (!isNaN(+body) && +body <= cityNames.length)) {
					let cityName;

					if (!isNaN(+body)) cityName = cityNames[+body - 1];
					else cityName = body.toLowerCase();

					ctx.session.cityName = cityName;

					ctx.scene.next();
					ctx.reply(
						'Введите номер школы в которой вы учитесь',
						null,
						Markup.keyboard([
							cityNames.includes(cityName.toLowerCase())
								? [Markup.button(botCommands.checkExisting)]
								: [],
							[Markup.button(botCommands.back, 'negative')],
						]),
					);
				} else {
					ctx.reply('Введите название русскими или английскими буквами или цифру города');
				}
			} else {
				ctx.reply('Введите название русскими или английскими буквами');
			}
		} catch (e) {
			console.error(e);
			ctx.scene.enter('error');
		}
	},
	async (ctx) => {
		try {
			const { body } = ctx.message;

			if (ctx.message.body === botCommands.back) {
				if (ctx.session.changedCity) {
					ctx.scene.selectStep(2);
					ctx.reply(
						'Введите название своего города',
						null,
						Markup.keyboard([
							(await getCityNames()).length > 0
								? [Markup.button(botCommands.checkExisting)]
								: [],
							[Markup.button(botCommands.back, 'negative')],
						]),
					);
				} else {
					ctx.reply(
						'Хотите ли вы поменять город?',
						null,
						createConfirmKeyboard([[Markup.button(botCommands.back, 'negative')]]),
					);
					ctx.scene.selectStep(1);
				}
				return;
			}

			if (body.toLowerCase() === botCommands.checkExisting.toLowerCase()) {
				const schoolNumbers = await getSchoolNumbers(translit(ctx.session.cityName));

				if (schoolNumbers.length) {
					ctx.reply(
						'Выберите свою школу\n' + schoolNumbers.join('\n'),
						null,
						mapListToKeyboard(schoolNumbers, {
							trailingButtons: [[Markup.button(botCommands.back, 'negative')]],
						}),
					);
				} else {
					ctx.reply(
						'В вашем городе не создано еще ни одной школы ¯_(ツ)_/¯',
						null,
						Markup.keyboard([]),
					);
				}
			} else if (/(\d)+/i.test(body)) {
				const schoolNumbers = await getSchoolNumbers(translit(ctx.session.cityName));
				if (!isNaN(+body)) {
					const schoolNumber = body;

					if (!schoolNumbers.includes(schoolNumber)) {
						const newSchool = await DataBase.createSchool(
							`${translit(ctx.session.cityName)}:${body}`,
						);

						if (newSchool) {
							ctx.session.schoolNumber = body;
							ctx.session.schoolName = `${translit(ctx.session.cityName)}:${body}`;
						} else {
							throw new Error('Не удалось создать школу');
						}
					} else {
						ctx.session.schoolNumber = body;
						ctx.session.schoolName = `${translit(ctx.session.cityName)}:${body}`;
					}

					let keys;

					if ((await DataBase.getClassesForSchool(ctx.session.schoolName)).length > 0) {
						keys = [
							[Markup.button(botCommands.checkExisting)],
							[Markup.button(botCommands.back, 'negative')],
						];
					} else {
						keys = [[Markup.button(botCommands.back, 'negative')]];
					}

					ctx.scene.next();
					ctx.reply(
						'Введите имя класса в котором вы учитесь',
						null,
						Markup.keyboard(keys),
					);
				} else {
					ctx.reply('Введите номер школы цифрами');
				}
			} else {
				ctx.reply('Введите номер школы цифрами');
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

			if (ctx.message.body.toLowerCase() === botCommands.back.toLowerCase()) {
				const cityNames = await getCityNames();

				ctx.scene.selectStep(3);
				ctx.reply(
					'Введите номер школы в которой вы учитесь',
					null,
					Markup.keyboard([
						cityNames.includes(ctx.session.cityName.toLowerCase())
							? [Markup.button(botCommands.checkExisting)]
							: [],
						[Markup.button(botCommands.back, 'negative')],
					]),
				);
				return;
			}

			if (body === botCommands.checkExisting) {
				const classNames = await DataBase.getAllClasses(
					`${ctx.session.schoolName}`,
				).then((classes) => classes.map((Class) => (Class ? Class.name : null)));

				if (classNames.length > 0) {
					ctx.session.classNames = classNames;

					ctx.reply(
						mapListToMessage(classNames),
						null,
						classNames.length <= 40
							? mapListToKeyboard(classNames, {
									trailingButtons: [
										[Markup.button(botCommands.back, 'negative')],
									],
							  })
							: null,
					);
					return;
				}
			}

			let spacelessClassName;

			if (!isNaN(+body)) spacelessClassName = ctx.session.classNames[+body - 1].toUpperCase();
			else spacelessClassName = body.replace(/\s*/g, '').toUpperCase();

			if (isValidClassName(spacelessClassName)) {
				const Class = await DataBase.getClassByName(
					spacelessClassName,
					ctx.session.schoolName,
				);

				if (Class) {
					ctx.session.schoolName = ctx.session.schoolName;
					ctx.session.Class = Class;
				} else {
					const Class = await DataBase.createClass(
						spacelessClassName,
						ctx.session.schoolName,
					);
					if (Class) {
						ctx.session.schoolName = ctx.session.schoolName;
						ctx.session.Class = Class;
					} else {
						throw new Error('Не удалось создать класс при его смене');
					}
				}

				ctx.scene.enter(ctx.session.nextScene, ctx.session.step);
			} else {
				ctx.reply('Неверное имя класса');
			}
		} catch (e) {
			console.error(e);
			ctx.scene.enter('error');
		}
	},
);
module.exports.pickClass = new Scene(
	'pickClass',
	async (ctx) => {
		try {
			const Classes = await DataBase.getAllClasses(
				await DataBase.getSchoolForStudent(ctx.message.user_id).then((school) =>
					school ? school.name : null,
				),
			);
			if (Classes.length > 0) {
				if (Classes.length === 1) {
					ctx.session.Class = Classes[0];
					ctx.scene.enter(ctx.session.nextScene, ctx.session.step);
					return;
				}

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
							Markup.button(name, 'default', { button: name }),
						),
						columns,
					),
				);
			} else {
				ctx.scene.enter('default');
				ctx.reply('Не существует ни одного класса');
			}
		} catch (e) {
			console.error(e);
			ctx.scene.enter('error');
		}
	},
	async (ctx) => {
		try {
			if (ctx.message.body === botCommands.back) {
				ctx.scene.enter(ctx.session.backScene ?? 'default', ctx.session.backStep ?? 0);
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
			ctx.scene.enter('error');
		}
	},
);
module.exports.enterDayIndexes = new Scene(
	'enterDaysIndexes',
	(ctx) => {
		ctx.scene.next();
		ctx.reply(
			'Введите за сколько дней до задания вы хотите получать уведомление (можно несколько через запятую или пробел)',
			null,
			createBackKeyboard(),
		);
	},
	(ctx) => {
		const {
			message: { body },
		} = ctx;

		if (body === botCommands.back) {
			ctx.scene.enter(ctx.session.backScene ?? 'default', ctx.session.backStep ?? 0);
			return;
		}

		const indexes = body.replace(/,/g, ' ').replace(/\s\s/g, ' ').split(' ');

		if (
			indexes.length > 0 &&
			indexes.every((index) => !isNaN(+index) && +index >= 0) &&
			indexes.every((index) => Number.isInteger(+index))
		) {
			ctx.session.enteredDayIndexes = indexes.map(Number);
			ctx.scene.enter(ctx.session.nextScene ?? 'default', ctx.session.step ?? 0);
		} else {
			ctx.reply('Вы должны ввести одно или более целых чисел');
		}

		cleanSession(ctx);
	},
);

async function getCityNames() {
	const schools = await DataBase.getAllSchools();
	const cityNames = [
		...new Set(
			schools.map(({ name: schoolName }) => retranslit(parseSchoolName(schoolName)[0])),
		),
	];

	return cityNames;
}
async function getSchoolNumbers(cityName) {
	const schools = await DataBase.getSchoolsForCity(translit(cityName));

	const schoolNumbers = [
		...new Set(schools.map(({ name: schoolName }) => parseSchoolName(schoolName)[1])),
	];

	return schoolNumbers;
}

async function getSchoolName(ctx) {
	return await DataBase.getSchoolForStudent(ctx.message.user_id).then((school) =>
		school ? school.name : null,
	);
}

async function sendStudentInfo(ctx) {
	if (!ctx.session.Student) {
		ctx.session.Student = await DataBase.getStudentByVkId(ctx.message.user_id);
	}

	const { role, class: classId, settings, firstName, secondName } = ctx.session.Student;
	let className, cityName, schoolNumber;

	if (classId) {
		const Class = await DataBase.getClassBy_Id(classId);

		className = Class.name || 'Нету';
		if (!Class) {
			[cityName, schoolNumber] = ['Нету', 'Нету'];
		} else {
			[cityName = 'Нету', schoolNumber = 'Нету'] = parseSchoolName(Class.schoolName);
		}
	} else {
		[cityName, schoolNumber, className] = ['Нету', 'Нету', 'Нету'];
	}

	const message = createUserInfo({
		role,
		className,
		settings,
		name: firstName + ' ' + secondName,
		cityName,
		schoolNumber,
	});

	ctx.reply(
		message,
		null,
		createBackKeyboard([[Markup.button(botCommands.changeSettings, 'primary')]]),
	);
}

function changeSchoolAction(ctx) {
	if (ctx.session) {
		ctx.session.nextScene = 'settings';
		ctx.session.step = 3;
		ctx.session.pickFor = 'Выберите школу \n';
		ctx.session.backScene = 'contributorPanel';
		ctx.session.backStep = 1;
		ctx.session.changed = changables.school;
		ctx.scene.enter('pickSchool');
	} else {
		console.log('Theres is no session in context');
		ctx.scene.enter('error');
	}
}
function changeClassAction(ctx) {
	if (ctx.session) {
		ctx.session.nextScene = 'settings';
		ctx.session.step = 3;
		ctx.session.pickFor = 'Выберите класс \n';
		ctx.session.backScene = 'contributorPanel';
		ctx.session.backStep = 1;
		ctx.session.changed = changables.class;
		ctx.scene.enter('pickClass');
	} else {
		console.log('Theres is no session in context');
		ctx.scene.enter('error');
	}
}

function enterDayIndexesAction(ctx) {
	if (ctx.session) {
		ctx.session.nextScene = 'settings';
		ctx.session.step = 3;
		ctx.session.backScene = 'contributorPanel';
		ctx.session.backStep = 1;
		ctx.session.changed = changables.daysForNotification;
		ctx.scene.enter('enterDaysIndexes');
	} else {
		console.log('Theres is no session in context');
		ctx.scene.enter('error');
	}
}

function changeNotificationTimeAction(ctx) {
	ctx.scene.next();
	ctx.session.changed = changables.notificationTime;
	ctx.reply(
		'Когда вы хотите получать уведомления? (в формате ЧЧ:ММ)',
		null,
		createBackKeyboard(),
	);
}

async function enableNotificationsAction(ctx) {
	let { Student } = ctx.session;

	if (!Student) {
		Student = await DataBase.getStudentByVkId(ctx.message.user_id);
	}

	Student.settings.notificationsEnabled = true;
	Student.save();

	ctx.scene.enter('default');
	ctx.reply('Уведомления включены', null, await createDefaultKeyboard(undefined, ctx));
}

async function disableNotificationsAction(ctx) {
	let { Student } = ctx.session;

	if (!Student) {
		Student = await DataBase.getStudentByVkId(ctx.message.user_id);
	}

	Student.settings.notificationsEnabled = false;
	Student.save();

	ctx.scene.enter('default');
	ctx.reply('Уведомления отключены', null, await createDefaultKeyboard(undefined, ctx));
}

async function getPossibleLessonsAndSetInSession(ctx) {
	if (ctx.session.Class === undefined) {
		ctx.session.Class = await DataBase.getStudentByVkId(ctx.message.user_id)
			.then(({ Class: classId }) => classId)
			.then((classId) => DataBase.getClassBy_Id(classId));
	}

	const possibleLessons = [...new Set(ctx.session.Class.schedule.flat().sort())];
	ctx.session.possibleLessons = possibleLessons;

	return possibleLessons;
}

function mapStudentToPreview(Contributors) {
	return Contributors.map(
		({ firstName, secondName, vkId }) => `${firstName} ${secondName} (${vkId})`,
	);
}

function validateDate(month, day, year) {
	return (
		inRange(month, 1, 12) &&
		inRange(day, 1, maxDatesPerMonth[month - 1]) &&
		year >= new Date().getFullYear()
	);
}

function parseDate(body) {
	return body
		.match(/([0-9]+)\.([0-9]+)\.?([0-9]+)?/)
		.slice(1)
		.map((n) => (isNaN(Number(n)) ? undefined : Number(n)));
}
function parseTime(body) {
	return body
		.match(/([0-9]+):([0-9]+)/)
		.slice(1)
		.map((n) => (isNaN(Number(n)) ? undefined : Number(n)));
}

/**
 *@param {{schedule: string[][]}} Class
 *
 *@return {string}
 */
function getScheduleString({ schedule }) {
	const message = schedule
		.map((lessons, i) => {
			return getDayScheduleString(lessons, daysOfWeek[i]);
		})
		.join('\n\n');

	return message;
}
/**
 * @param {string[]} lessons
 * @param {string} dayName
 *
 * @return {string}
 */
function getDayScheduleString(lessons, dayName) {
	const dayMessage = lessons.length > 0 ? `${dayName}: \n ${mapListToMessage(lessons)} ` : '';

	return dayMessage;
}

//Returns amount of days for each of which whe should send homework
function getLengthOfHomeworkWeek() {
	const date = new Date().getDay();

	return date >= 5 ? 6 : 7 - date;
}

async function mapAttachmentsToObject(attachments) {
	const mappedAttachments = [];

	for (const att of attachments) {
		mappedAttachments.push({
			value: await parseAttachmentsToVKString(att),
			url: findMaxPhotoResolution(att[att.type]),
			album_id: att[att.type].album_id,
		});
	}

	return mappedAttachments;
}

function getTextsAndAttachmentsFromForwarded({ body = '', attachments = [], fwd_messages = [] }) {
	if (fwd_messages.length === 0) {
		return {
			body: body,
			attachments: attachments,
		};
	}

	const nestedMessagesPayload = fwd_messages.reduce(({ body = '', attachments = [] }, c) => {
		const payload = getTextsAndAttachmentsFromForwarded(c);

		return {
			body: (body ? body + '\n' : '') + payload.body,
			attachments: attachments.concat(payload.attachments),
		};
	}, {});

	return {
		body: (body ? body + '\n' : '') + nestedMessagesPayload.body,
		attachments: attachments.concat(nestedMessagesPayload.attachments),
	};
}
