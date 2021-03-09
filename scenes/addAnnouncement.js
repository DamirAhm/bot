//@ts-check

const { buttonColors, sceneNames } = require('../utils/constants.js');
const {
	getTomorrowDate,
	parseDate,
	getDateWithOffset,
	isToday,
} = require('../utils/dateFunctions.js');
const Scene = require('node-vk-bot-api/lib/scene'),
	{
		createDefaultKeyboard,
		createContentDiscription,
		createConfirmKeyboard,
		createBackKeyboard,
		notifyAllInClass,
	} = require('../utils/messagePayloading.js'),
	{ DataBase: DB, Roles } = require('bot-database'),
	botCommands = require('../utils/botCommands.js'),
	Markup = require('node-vk-bot-api/lib/markup'),
	DataBase = new DB(process.env.MONGODB_URI),
	{
		getSchoolName,
		getTextsAndAttachmentsFromForwarded,
		mapAttachmentsToObject,
	} = require('../utils/functions.js'),
	{ isAdmin, isContributor } = require('../utils/roleChecks'),
	{ validateDate } = require('../utils/validators'),
	{ cleanDataForSceneFromSession } = require('../utils/sessionCleaners.js');

const isNeedToPickClass = false;

const dateRegExp = /[0-9]+\.[0-9]+(\.[0-9])?/;

const addAnnouncementScene = new Scene(
	sceneNames.addAnnouncement,
	async (ctx) => {
		try {
			const needToPickClass = (await isAdmin(ctx)) && isNeedToPickClass;
			if (needToPickClass && !ctx.session.Class) {
				ctx.session.nextScene = sceneNames.addAnnouncement;
				ctx.session.pickFor = 'Выберите класс у которому хотите добавить обьявление \n';
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
							'Введите содержимое объявления (можно прикрепить фото)',
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
				const peekedClass = await isAdmin(ctx);
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

				ctx.session.newAnnouncement = { text: body, attachments: parsedAttachments };

				ctx.scene.next();
				ctx.reply(
					'Введите дату объявления (в формате ДД.ММ)',
					null,
					createBackKeyboard([
						[
							Markup.button(botCommands.onToday, buttonColors.positive),
							Markup.button(botCommands.onTomorrow, buttonColors.positive),
						],
					]),
				);
			} else {
				ctx.reply('Отправлять можно только фото');
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

					if (date.getTime() >= getDateWithOffset(0).getTime()) {
						ctx.session.newAnnouncement.to = date;
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

			if (ctx.session.newAnnouncement.to) {
				const { Student } = ctx.session;
				const isUserContributor = await isContributor(Student);

				ctx.scene.next();
				ctx.reply(
					`Вы уверены что хотите создать такое объявление? \n ${createContentDiscription(
						ctx.session.newAnnouncement,
					)}`,
					ctx.session.newAnnouncement.attachments.map(({ value }) => value),
					createConfirmKeyboard(
						isUserContributor
							? [[Markup.button(botCommands.yesAndMakeOnlyForMe, sceneNames.default)]]
							: undefined,
					),
				);
			} else {
				throw new Error("There's no to prop in new announcement");
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
					newAnnouncement: { to, text, attachments },
					Class: { name: className },
				} = ctx.session;

				const { Student } = ctx.session;

				let isOnlyForUser;
				if (Student.role === Roles.student) {
					isOnlyForUser = true;
				} else {
					isOnlyForUser =
						answer.trim().toLowerCase() ===
						botCommands.yesAndMakeOnlyForMe.toLowerCase();
				}

				const res = await DataBase.addAnnouncement(
					{
						classNameOrInstance: ctx.session.Class,
						schoolName: await getSchoolName(ctx),
					},
					{
						text,
						attachments,
						onlyFor: isOnlyForUser ? [Student.vkId] : [],
					},
					to,
					false,
					ctx.message.user_id,
				);

				if (res) {
					// axios.post(process.env.UPDATE_NOTIFICATION_URL, {
					// 	data: {
					// 		onAnnouncementAdded: {
					// 			text,
					// 			attachments,
					// 			to,
					// 			student_id: ctx.message.user_id,
					// 			_id: res,
					// 			pinned: false,
					// 			className,
					// 			schoolName: ctx.session.Class.schoolName,
					// 		},
					// 	},
					// 	trigger: 'ON_ANNOUNCEMENT_ADDED',
					// });

					ctx.scene.enter(sceneNames.default);
					ctx.reply(
						'Объявление успешно создано',
						null,
						await createDefaultKeyboard(undefined, ctx),
					);

					if (isToday(to) && !isOnlyForUser) {
						notifyAllInClass(
							ctx,
							className,
							`На сегодня появилось новое объявление:\n ${text}`,
							attachments,
						);
					}
				} else {
					ctx.scene.enter(sceneNames.error);
				}
			} else if (ctx.message.body.toLowerCase() === botCommands.no.toLowerCase()) {
				ctx.scene.selectStep(2);
				ctx.reply(
					'Введите дату объявления (в формате ДД.ММ)',
					null,
					createBackKeyboard([
						[
							Markup.button(botCommands.onToday, buttonColors.positive),
							Markup.button(botCommands.onTomorrow, buttonColors.positive),
						],
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
module.exports = addAnnouncementScene;
