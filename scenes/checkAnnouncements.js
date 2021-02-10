//@ts-check
const Scene = require('node-vk-bot-api/lib/scene'),
	{ createBackKeyboard, monthsRP } = require('../utils/messagePayloading.js'),
	{ DataBase: DB } = require('bot-database'),
	botCommands = require('../utils/botCommands.js'),
	{ Roles } = require('bot-database/build/Models/utils.js'),
	Markup = require('node-vk-bot-api/lib/markup'),
	DataBase = new DB(process.env.MONGODB_URI),
	{
		getTomorrowDate,
		cleanDataForSceneFromSession,
		parseDate,
		validateDate,
	} = require('../utils/functions.js');

const isAdmin = async (ctx) => {
	let role = await DataBase.getRole(ctx.message.user_id);

	return role === Roles.admin;
};
const isNeedToPickClass = false;

const dateRegExp = /[0-9]+\.[0-9]+(\.[0-9])?/;

const checkAnnouncementsScene = new Scene(
	'checkAnnouncements',
	async (ctx) => {
		try {
			const needToPickClass = (await isAdmin(ctx)) && isNeedToPickClass;

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
				const announcements = await DataBase.getAnnouncements(
					{ classNameOrInstance: ctx.session.Class, schoolName: undefined },
					date,
				);
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

module.exports = checkAnnouncementsScene;
