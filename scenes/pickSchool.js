//@ts-check
const { isValidClassName } = require('bot-database/build/Models/utils');
const { buttonColors, sceneNames } = require('../utils/constants.js');
const { translit, capitalize, retranslit } = require('../utils/translits.js');
const Scene = require('node-vk-bot-api/lib/scene'),
	{
		mapListToMessage,
		createConfirmKeyboard,
		createBackKeyboard,
	} = require('../utils/messagePayloading.js'),
	{ DataBase: DB } = require('bot-database'),
	botCommands = require('../utils/botCommands.js'),
	Markup = require('node-vk-bot-api/lib/markup'),
	DataBase = new DB(process.env.MONGODB_URI),
	{
		mapListToKeyboard,
		parseSchoolName,
		getCityNames,
		getSchoolNumbers,
		getSchoolName,
		mapButtons,
	} = require('../utils/functions.js');

const pickSchoolScene = new Scene(
	sceneNames.pickSchool,
	//! Вернуть если решишь вернуть фичу с городами
	// async (ctx) => {
	// 	try {
	// 		const keyboard = (await getSchoolName(ctx))
	// 			? createConfirmKeyboard([[Markup.button(botCommands.back, buttonColors.negative)]])
	// 			: Markup.keyboard([
	// 					[Markup.button(botCommands.yes, buttonColors.positive)],
	// 					[Markup.button(botCommands.back, buttonColors.negative)],
	// 			  ]);

	// 		ctx.scene.next();
	// 		ctx.reply('Хотите ли вы поменять город?', null, keyboard);
	// 	} catch (e) {
	// 		console.error(e);
	// 		ctx.scene.enter(sceneNames.error);
	// 	}
	// },
	async (ctx) => {
		try {
			// const { body } = ctx.message;

			// if (body.toLowerCase() === botCommands.back.toLowerCase()) {
			// 	ctx.scene.enter(
			// 		ctx.session.backScene ?? sceneNames.default,
			// 		ctx.session.backStep ?? 0,
			// 	);
			// 	return;
			// }

			// if (body.toLowerCase() === botCommands.yes.toLowerCase()) {
			// 	ctx.session.changedCity = true;

			// 	ctx.scene.selectStep(2);
			// 	ctx.reply(
			// 		'Введите название своего города',
			// 		null,
			// 		createBackKeyboard([[Markup.button(botCommands.checkExisting)]]),
			// 	);
			// } else if (body.toLowerCase() === botCommands.no.toLowerCase()) {
			ctx.session.cityName = retranslit('ижевск'); //retranslit(parseSchoolName(await getSchoolName(ctx))[0]);
			ctx.scene.next();
			ctx.reply(
				'Введите номер своей школы',
				null,
				createBackKeyboard([[Markup.button(botCommands.checkExisting)]]),
			);
			// } else {
			// 	ctx.reply('Ответьте да или нет');
			// }
		} catch (e) {
			console.error(e);
		}
	},
	// async (ctx) => {
	// 	try {
	// 		let { body } = ctx.message;

	// 		if (ctx.message.body === botCommands.back) {
	// 			ctx.reply(
	// 				'Хотите ли вы поменять город?',
	// 				null,
	// 				createConfirmKeyboard([
	// 					[Markup.button(botCommands.back, buttonColors.negative)],
	// 				]),
	// 			);
	// 			ctx.scene.selectStep(1);
	// 			return;
	// 		}

	// 		if (body.toLowerCase() === botCommands.checkExisting.toLowerCase()) {
	// 			const cityNames = await getCityNames();

	// 			ctx.session.cityNames = cityNames;

	// 			ctx.reply(
	// 				'Выберите свой город\n' + mapListToMessage(cityNames.map(capitalize)),
	// 				null,
	// 				mapListToKeyboard(cityNames.map(capitalize), {
	// 					trailingButtons: [[Markup.button(botCommands.back, buttonColors.negative)]],
	// 				}),
	// 			);
	// 		} else if (/([a-z]|[а-я]|\d)+/i.test(body)) {
	// 			const cityNames = await getCityNames();

	// 			if (/([a-z]|[а-я])+/i.test(body) || (!isNaN(+body) && +body <= cityNames.length)) {
	// 				let cityName;

	// 				if (!isNaN(+body)) cityName = cityNames[+body - 1];
	// 				else cityName = body.toLowerCase();

	// 				ctx.session.cityName = cityName;

	// 				ctx.scene.next();
	// 				ctx.reply(
	// 					'Введите номер школы в которой вы учитесь',
	// 					null,
	// 					Markup.keyboard([
	// 						cityNames.includes(cityName.toLowerCase())
	// 							? [Markup.button(botCommands.checkExisting)]
	// 							: [],
	// 						[Markup.button(botCommands.back, buttonColors.negative)],
	// 					]),
	// 				);
	// 			} else {
	// 				ctx.reply('Введите название русскими или английскими буквами или цифру города');
	// 			}
	// 		} else {
	// 			ctx.reply('Введите название русскими или английскими буквами');
	// 		}
	// 	} catch (e) {
	// 		console.error(e);
	// 		ctx.scene.enter(sceneNames.error);
	// 	}
	// },
	async (ctx) => {
		try {
			const { body } = ctx.message;

			// if (ctx.message.body === botCommands.back) {
			// if (ctx.session.changedCity) {
			// 	ctx.scene.selectStep(2);
			// 	ctx.reply(
			// 		'Введите название своего города',
			// 		null,
			// 		Markup.keyboard([
			// 			(await getCityNames()).length > 0
			// 				? [Markup.button(botCommands.checkExisting)]
			// 				: [],
			// 			[Markup.button(botCommands.back, buttonColors.negative)],
			// 		]),
			// 	);
			// } else {
			// 	ctx.reply(
			// 		'Хотите ли вы поменять город?',
			// 		null,
			// 		createConfirmKeyboard([
			// 			[Markup.button(botCommands.back, buttonColors.negative)],
			// 		]),
			// 	);
			// 	ctx.scene.selectStep(1);
			// }
			// return;
			// }
			if (body.toLowerCase() === botCommands.back.toLowerCase()) {
				ctx.scene.enter(
					ctx.session.backScene ?? sceneNames.default,
					ctx.session.backStep ?? 0,
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
							trailingButtons: [
								[Markup.button(botCommands.back, buttonColors.negative)],
							],
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

					let keyboard;

					if ((await DataBase.getClassesForSchool(ctx.session.schoolName)).length > 0) {
						keyboard = createBackKeyboard([[Markup.button(botCommands.checkExisting)]]);
					} else {
						keyboard = createBackKeyboard();
					}

					ctx.scene.next();
					ctx.reply('Введите имя класса в котором вы учитесь', null, keyboard);
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
				message: { body },
			} = ctx;

			if (ctx.message.body.toLowerCase() === botCommands.back.toLowerCase()) {
				const cityNames = await getCityNames();

				// ctx.scene.selectStep(3);
				ctx.scene.selectStep(1);
				ctx.reply(
					'Введите номер школы в которой вы учитесь',
					null,
					createBackKeyboard(
						mapButtons([
							[
								cityNames.includes(ctx.session.cityName.toLowerCase()),
								[Markup.button(botCommands.checkExisting)],
							],
						]),
					),
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
										[Markup.button(botCommands.back, buttonColors.negative)],
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

				if (ctx.session.needToUpdateStudent) {
					const res = await DataBase.changeClass(ctx.message.user_id, ctx.session.Class);

					if (res) {
						ctx.reply('Класс успешно изменён');
					} else {
						ctx.reply('К сожалению не удалось изменить класс');
					}
					ctx.scene.enter(ctx.session.nextScene ?? 'default', ctx.session.step ?? 0);
				} else {
					ctx.scene.enter(ctx.session.nextScene ?? 'default', ctx.session.step ?? 0);
				}
			} else {
				ctx.reply('Неверное имя класса');
			}
		} catch (e) {
			console.error(e);
			ctx.scene.enter(sceneNames.error);
		}
	},
);
module.exports = pickSchoolScene;
