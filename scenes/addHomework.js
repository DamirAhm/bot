//@ts-check
const Scene = require('node-vk-bot-api/lib/scene'),
	{
		createDefaultKeyboard,
		mapListToMessage,
		createContentDiscription,
		createConfirmKeyboard,
		createBackKeyboard,
	} = require('../utils/messagePayloading.js'),
	{ DataBase: DB } = require('bot-database'),
	{ findNextLessonDate, findNextDayWithLesson } = require('bot-database/build/utils/functions'),
	botCommands = require('../utils/botCommands.js'),
	{ Roles, Lessons } = require('bot-database/build/Models/utils.js'),
	Markup = require('node-vk-bot-api/lib/markup'),
	DataBase = new DB(process.env.MONGODB_URI),
	{
		getDateWithOffset,
		cleanDataForSceneFromSession,
		parseDate,
		validateDate,
		getSchoolName,
		getTextsAndAttachmentsFromForwarded,
		mapAttachmentsToObject,
		getPossibleLessonsAndSetInSession,
	} = require('../utils/functions.js');

const isAdmin = async (ctx) => {
	let role = await DataBase.getRole(ctx.message.user_id);

	return role === Roles.admin;
};
const isNeedToPickClass = false;

const isContributor = async (ctx) => {
	let role = await DataBase.getRole(ctx.message.user_id);

	return [Roles.admin, Roles.contributor].includes(role);
};

const dateRegExp = /[0-9]+\.[0-9]+(\.[0-9])?/;

const addHomeworkScene = new Scene(
	'addHomework',
	async (ctx) => {
		try {
			const needToPickClass = (await isAdmin(ctx)) && isNeedToPickClass;
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

				return;
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

				return;
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

					if (date.getTime() >= getDateWithOffset(0).getTime()) {
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
					Class,
				} = ctx.session;
				ctx.session.Class = undefined;

				const res = await DataBase.addHomework(
					{
						classNameOrInstance: Class,
						schoolName: await getSchoolName(ctx),
					},
					lesson,
					{ text, attachments, lesson },
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
module.exports = addHomeworkScene;
