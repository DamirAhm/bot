//@ts-check

const config = require('../config.js');
const { buttonColors, sceneNames } = require('../utils/constants.js');
const { parseDate, getDateWithOffset } = require('../utils/dateFunctions.js');
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
		getSchoolName,
		getTextsAndAttachmentsFromForwarded,
		mapAttachmentsToObject,
		getPossibleLessonsAndSetInSession,
	} = require('../utils/functions.js'),
	{ isAdmin, isContributor } = require('../utils/roleChecks'),
	{ validateDate } = require('../utils/validators'),
	{ cleanDataForSceneFromSession } = require('../utils/sessionCleaners.js');

const dateRegExp = /[0-9]+\.[0-9]+(\.[0-9])?/;

const { isNeedToPickClass } = config;

const addHomeworkScene = new Scene(
	sceneNames.addHomework,
	async (ctx) => {
		try {
			const needToPickClass = (await isAdmin(ctx)) && isNeedToPickClass;
			if (needToPickClass && !ctx.session.Class) {
				ctx.session.nextScene = sceneNames.addHomework;
				ctx.session.pickFor = 'Выберите класс которому хотите добавить дз \n';
				ctx.session.backScene = sceneNames.contributorPanel;
				ctx.scene.enter(sceneNames.pickClass);
			} else {
				const Student = await DataBase.getStudentByVkId(
					ctx.session.userId || ctx.message.user_id,
				);
				ctx.session.Student = Student;

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
						ctx.scene.enter(sceneNames.register);
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
			ctx.scene.enter(sceneNames.error);
		}
	},
	async (ctx) => {
		try {
			const { message } = ctx;

			if (message.body === botCommands.back) {
				const peekedClass = await isContributor(ctx);
				if (peekedClass) {
					ctx.scene.enter(sceneNames.contributorPanel);
				} else {
					ctx.scene.enter(sceneNames.default);
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
			ctx.scene.enter(sceneNames.error);
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
					'Введите дату на которую задано задание (в формате ДД.ММ)',
					null,
					createBackKeyboard(
						[Markup.button(botCommands.onNextLesson, buttonColors.positive)],
						1,
					),
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
			ctx.scene.enter(sceneNames.error);
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
				ctx.reply('Дата должна быть в формате ДД.ММ');
				return;
			}

			if (ctx.session.newHomework.to) {
				const { Student } = ctx.session;
				const isUserContributor = await isContributor(Student);

				ctx.scene.next();
				ctx.reply(
					`
                Вы уверены что хотите создать такое задание? ${
					ctx.session.Student.role !== Roles.student
						? '(Его будете видеть только вы)'
						: ''
				}
                ${createContentDiscription(ctx.session.newHomework)}
                `,
					ctx.session.newHomework.attachments.map(({ value }) => value),
					createConfirmKeyboard(
						isUserContributor
							? [[Markup.button(botCommands.yesAndMakeOnlyForMe, sceneNames.default)]]
							: undefined,
					),
				);
			} else {
				throw new Error("Threre's no to prop in new Homework");
			}
		} catch (e) {
			console.error(e);
			ctx.scene.enter(sceneNames.error);
		}
	},
	async (ctx) => {
		try {
			const {
				message: { body: answer },
			} = ctx;

			if (
				[
					botCommands.yes.toLowerCase(),
					botCommands.yesAndMakeOnlyForMe.toLowerCase(),
				].includes(answer.trim().toLowerCase())
			) {
				const {
					newHomework: { to, lesson, text, attachments },
					Class,
				} = ctx.session;
				ctx.session.Class = undefined;

				const { Student } = ctx.session;

				let isOnlyForUser;
				if (Student.role === Roles.student) {
					isOnlyForUser = true;
				} else {
					isOnlyForUser =
						answer.trim().toLowerCase() ===
						botCommands.yesAndMakeOnlyForMe.toLowerCase();
				}

				const res = await DataBase.addHomework(
					{
						classNameOrInstance: Class,
						schoolName: await getSchoolName(ctx),
					},
					{
						text,
						attachments,
						onlyFor: isOnlyForUser ? [Student.vkId] : [],
						lesson,
					},
					ctx.message.user_id,
					to,
				);

				if (res) {
					ctx.reply(
						'Домашнее задание успешно создано',
						null,
						await createDefaultKeyboard(undefined, ctx),
					);
					ctx.scene.enter(sceneNames.default);
				} else {
					ctx.scene.enter(sceneNames.error);
				}
			} else if (ctx.message.body === botCommands.no) {
				ctx.scene.selectStep(3);
				ctx.reply(
					'Введите дату на которую задано задание (в формате ДД.ММ)',
					null,
					createBackKeyboard([
						[Markup.button(botCommands.onNextLesson, buttonColors.positive)],
					]),
				);
			} else {
				ctx.reply('Ответьте да или нет');
			}

			cleanDataForSceneFromSession(ctx);
		} catch (e) {
			console.error(e);
			ctx.scene.enter(sceneNames.error);
		}
	},
);
module.exports = addHomeworkScene;
