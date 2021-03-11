//@ts-check
const { isValidClassName } = require('bot-database/build/Models/utils');
const { buttonColors, sceneNames } = require('../utils/constants.js');
const { cleanDataForSceneFromSession } = require('../utils/sessionCleaners.js');
const { translit } = require('../utils/translits.js');
const Scene = require('node-vk-bot-api/lib/scene'),
	{
		createDefaultKeyboard,
		mapListToMessage,
		createConfirmKeyboard,
		createBackKeyboard,
	} = require('../utils/messagePayloading.js'),
	{ DataBase: DB } = require('bot-database'),
	botCommands = require('../utils/botCommands.js'),
	Markup = require('node-vk-bot-api/lib/markup'),
	DataBase = new DB(process.env.MONGODB_URI),
	{ mapListToKeyboard, getCityNames, getSchoolNumbers } = require('../utils/functions.js');

const registerScene = new Scene(
	sceneNames.register,
	// async (ctx) => {
	// 	ctx.scene.next();
	// 	ctx.reply(
	// 		'Введите название города в котором вы учитесь',
	// 		null,
	// 		Markup.keyboard([Markup.button(botCommands.checkExisting)]),
	// 	);
	// },
	async (ctx) => {
		try {
			//! Если решишь снова вернуть выбор города
			// let { body } = ctx.message;
			// if (body.toLowerCase() === botCommands.checkExisting.toLowerCase()) {
			// 	const cityNames = await getCityNames();

			// 	ctx.session.cityNames = cityNames;

			// 	ctx.reply(
			// 		'Выберите свой город\n' + mapListToMessage(cityNames.map(capitalize)),
			// 		null,
			// 		mapListToKeyboard(cityNames.map(capitalize)),
			// 	);
			// } else if (/([a-z]|[а-я]|\d)+/i.test(body)) {
			// let body = 'Ижевск';
			const cityNames = await getCityNames();
			ctx.session.cityNames = cityNames;

			// if (/([a-z]|[а-я])+/i.test(body) || (!isNaN(+body) && +body <= cityNames.length)) {
			let cityName = 'ижевск';

			// if (!isNaN(+body)) cityName = cityNames[+body - 1];
			// else {
			// cityName = body.toLowerCase();
			// }
			ctx.session.cityName = cityName.toLowerCase();

			ctx.scene.next();
			ctx.reply(
				'Введите номер школы в которой вы учитесь',
				null,
				createBackKeyboard(
					cityNames.includes(cityName)
						? [[Markup.button(botCommands.checkExisting)]]
						: [],
				),
			);
			// } else {
			// 	ctx.reply('Введите название русскими или английскими буквами или цифру города');
			// }
			// } else {
			// 	ctx.reply('Введите название русскими или английскими буквами');
			// }
		} catch (e) {
			console.error(e);
			ctx.scene.enter(sceneNames.error);
		}
	},
	async (ctx) => {
		try {
			const { body } = ctx.message;

			if (body.toLowerCase() === botCommands.back.toLowerCase()) {
				const { cityNames, cityName } = ctx.session;

				ctx.scene.selectStep(1);
				ctx.reply(
					'Введите номер школы в которой вы учитесь',
					null,
					createBackKeyboard(
						cityNames.includes(cityName)
							? [[Markup.button(botCommands.checkExisting)]]
							: [],
					),
				);

				//! Если решишь снова вернуть выбор города
				// ctx.reply(
				// 	'Введите название города в котором вы учитесь',
				// 	null,
				// 	Markup.keyboard([Markup.button(botCommands.checkExisting)]),
				// );
				return;
			}

			if (body.toLowerCase() === botCommands.checkExisting.toLowerCase()) {
				const schoolNumbers = await getSchoolNumbers(translit(ctx.session.cityName));

				if (schoolNumbers.length) {
					ctx.reply(
						'Выберите свою школу\n' + schoolNumbers.join('\n'),
						null,
						mapListToKeyboard(schoolNumbers),
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
			ctx.scene.enter(sceneNames.error);
		}
	},
	async (ctx) => {
		try {
			const {
				message: { body, user_id },
			} = ctx;

			if (body.toLowerCase() === botCommands.back.toLowerCase()) {
				const { cityNames, cityName } = ctx.session;

				ctx.scene.selectStep(1);
				ctx.reply(
					'Введите номер школы в которой вы учитесь',
					null,
					createBackKeyboard(
						cityNames.includes(cityName)
							? [[Markup.button(botCommands.checkExisting)]]
							: [],
					),
				);
				return;
			}

			if (body === botCommands.checkExisting) {
				const classNames = await DataBase.getAllClasses(ctx.session.schoolName)
					.then((classes) => classes.map((Class) => (Class ? Class.name : null)))
					.catch((err) => {
						console.error(err);
						ctx.scene.enter(sceneNames.error);
						return null;
					});

				if (classNames.length > 0) {
					ctx.session.classNames = classNames;

					ctx.reply(
						mapListToMessage(classNames),
						null,
						classNames.length <= 35
							? mapListToKeyboard(classNames, {
									trailingButtons: [
										[Markup.button(botCommands.back, buttonColors.negative)],
									],
							  })
							: null,
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
						ctx.scene.enter(sceneNames.default);
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
				ctx.reply('Неверный формат имени класса');
			}
		} catch (e) {
			console.error(e);
			ctx.scene.enter(sceneNames.error);
		}
	},
	async (ctx) => {
		try {
			const { body } = ctx.message;

			if (body.toLowerCase() === botCommands.yes.toLowerCase()) {
				cleanDataForSceneFromSession(ctx);
				ctx.scene.enter(sceneNames.changeSchedule);
			} else if (body.toLowerCase() === botCommands.no.toLowerCase()) {
				const { name: className } = await DataBase.getClassForStudent(ctx.message.user_id);

				ctx.reply(
					`Вы успешно зарегестрированны в ${className} классе ${ctx.session.schoolNumber} школы, города ${ctx.session.cityName}`,
					null,
					await createDefaultKeyboard(undefined, ctx),
				);
				ctx.scene.enter(sceneNames.default);
				cleanDataForSceneFromSession(ctx);
			} else {
				ctx.reply(botCommands.notUnderstood);
			}
		} catch (e) {
			console.error(e);
			ctx.scene.enter(sceneNames.error);
		}
	},
);

module.exports = registerScene;
