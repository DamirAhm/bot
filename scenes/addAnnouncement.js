//@ts-check
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
		getTomorrowDate,
		getDateWithOffset,
		isToday,
		cleanDataForSceneFromSession,
		parseDate,
		validateDate,
		getSchoolName,
		getTextsAndAttachmentsFromForwarded,
		mapAttachmentsToObject,
	} = require('../utils/functions.js');

const isAdmin = async (ctx) => {
	let role = await DataBase.getRole(ctx.message.user_id);

	return role === Roles.admin;
};
const isNeedToPickClass = false;

const dateRegExp = /[0-9]+\.[0-9]+(\.[0-9])?/;

const addAnnouncementScene = new Scene(
	'addAnnouncement',
	async (ctx) => {
		try {
			const needToPickClass = (await isAdmin(ctx)) && isNeedToPickClass;
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

					if (date.getTime() >= getDateWithOffset(0).getTime()) {
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
					`Вы уверены что хотите создать такое объявление? \n ${createContentDiscription(
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

				const res = await DataBase.addAnnouncement(
					{
						classNameOrInstance: ctx.session.Class,
						schoolName: await getSchoolName(ctx),
					},
					{ text, attachments },
					to,
					false,
					ctx.message.user_id,
				);

				ctx.session.Class = undefined;

				if (res) {
					ctx.reply(
						'Объявление успешно создано',
						null,
						await createDefaultKeyboard(undefined, ctx),
					);

					if (isToday(to)) {
						notifyAllInClass(
							ctx,
							className,
							`На сегодня появилось новое объявление:\n ${text}`,
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
module.exports = addAnnouncementScene;
