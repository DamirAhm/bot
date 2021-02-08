//@ts-check
const { capitalize } = require('../utils/translits.js');
const Scene = require('node-vk-bot-api/lib/scene'),
	{
		createDefaultKeyboard,
		getLessonsList,
		mapListToMessage,
		createConfirmKeyboard,
		createBackKeyboard,
	} = require('../utils/messagePayloading.js'),
	{ DataBase: DB } = require('bot-database'),
	botCommands = require('../utils/botCommands.js'),
	{ Roles, Lessons, daysOfWeek } = require('bot-database/build/Models/utils.js'),
	Markup = require('node-vk-bot-api/lib/markup'),
	DataBase = new DB(process.env.MONGODB_URI),
	{ cleanDataForSceneFromSession } = require('../utils/functions.js');

const isAdmin = async (ctx) => {
	let role = await DataBase.getRole(ctx.message.user_id);

	return role === Roles.admin;
};

const changeScheduleScene = new Scene(
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
							Markup.button(day, 'default', { button: day }),
						);

						buttons.push(Markup.button('Заполнить всё', 'primary'));

						const message =
							'Выберите день у которого хотите изменить расписание\n' +
							mapListToMessage(days) +
							'\n0. Заполнить всё';

						ctx.scene.next();
						ctx.reply(message, null, createBackKeyboard(buttons, 3));
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

				const Class =
					ctx.session.Class ||
					(await DataBase.getStudentByVkId(ctx.message.user_id).then((u) =>
						DataBase.getClassBy_Id(u.class),
					));
				const { schedule } = Class;
				const lessons = schedule.flat(2);

				const message = `Введите новое расписание цифрами через запятую, выбирая из списка или вписывая свои предметы если их там нет\n
				 ${getLessonsList(lessons)}\n Сначала на понедельник`;

				ctx.reply(
					message,
					null,
					createBackKeyboard([Markup.button(botCommands.leaveEmpty, 'primary')], 1),
				);

				ctx.scene.next();
			} else if (
				(!isNaN(+body) && +body >= 1 && +body <= 7) ||
				Object.values(daysOfWeek).includes(body)
			) {
				ctx.session.changingDay = +body;

				const Class =
					ctx.session.Class ||
					(await DataBase.getStudentByVkId(ctx.message.user_id).then((u) =>
						DataBase.getClassBy_Id(u.class),
					));
				const { schedule } = Class;
				const lessons = schedule.flat(2);

				const message = `Введите новое расписание цифрами через запятую, выбирая из этого списка или вписывая свои предметы если их нет в списке\n ${getLessonsList(
					lessons,
				)}`;

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

			let indexes = body
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean);

			if (indexes.every((i) => /([0-9a-zа-я]]*\s*,\s*)*$/i.test(i))) {
				if (
					indexes.every((index) =>
						isNaN(index) ? true : index >= 0 && index < Lessons.length,
					)
				) {
					const newLessons = indexes.map((i) => {
						if (!isNaN(i)) return Lessons[+i];
						else return capitalize(i);
					});
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
					await DataBase.setSchedule(
						{ classNameOrInstance: Class, schoolName: Class.schoolName },
						schedule,
					);
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
module.exports = changeScheduleScene;
