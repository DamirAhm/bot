//@ts-check

const { sceneNames } = require('../utils/constants.js');
const Scene = require('node-vk-bot-api/lib/scene'),
	config = require('../config.js'),
	{
		createDefaultKeyboard,
		createBackKeyboard,
		createDefaultKeyboardSync,
	} = require('../utils/messagePayloading.js'),
	{ DataBase: DB } = require('bot-database'),
	botCommands = require('../utils/botCommands.js'),
	{ Roles } = require('bot-database/build/Models/utils.js'),
	VK_API = require('bot-database/build/VkAPI/VK_API.js').default,
	DataBase = new DB(process.env.MONGODB_URI),
	vk = new VK_API(process.env.VK_API_KEY, +config['GROUP_ID'], +config['ALBUM_ID']);

const addRedactorScene = new Scene(
	sceneNames.addRedactor,
	async (ctx) => {
		try {
			const Student = await DataBase.getStudentByVkId(ctx.message.user_id);

			if (Student) {
				if ([Roles.admin, Roles.contributor].includes(Student.role)) {
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
						createDefaultKeyboardSync(Student.role, Student.class),
					);
					ctx.scene.enter(sceneNames.default);
				}
			} else {
				throw new Error('Can not find student');
			}
		} catch (e) {
			console.error(e);
			ctx.scene.enter(sceneNames.error);
		}
	},
	async (ctx) => {
		try {
			if (ctx.message.body.trim() === botCommands.back) {
				ctx.scene.enter(sceneNames.default);
				return;
			}
			const {
				message: { body },
			} = ctx;
			const id = Number(body.trim());

			const Student = await DataBase.getStudentByVkId(ctx.message.user_id);

			if (!isNaN(id)) {
				let Student = await DataBase.getStudentByVkId(id);

				if (Student && Student.role === Roles.admin) {
					ctx.reply(
						'Пользователь уже является администратором',
						null,
						await createDefaultKeyboard(Student),
					);
					ctx.scene.enter(sceneNames.default);
					return;
				} else if (Student && Student.role === Roles.contributor) {
					ctx.reply(
						'Пользователь уже является редактором',
						null,
						await createDefaultKeyboard(Student),
					);
					ctx.scene.enter(sceneNames.default);
					return;
				}

				if (Student.role === Roles.admin) {
					if (!Student) {
						const response = await vk.api('users.get', { user_ids: id });

						if (
							typeof response === 'object' &&
							'error_code' in response &&
							//@ts-ignore
							!response.error_code &&
							response
						) {
							const { first_name, last_name } = response[0];
							Student = await DataBase.createStudent(id, {
								firstName: first_name,
								lastName: last_name,
								registered: false,
								class_id: undefined,
							});
						} else {
							throw new Error(JSON.stringify(response));
						}
					}

					await Student.updateOne({ role: Roles.contributor });

					ctx.reply(
						'Пользователь стал редактором',
						null,
						await createDefaultKeyboard(Student),
					);
					ctx.scene.enter(sceneNames.default);
				} else if (Student.role === Roles.contributor) {
					const { class: classId } = await DataBase.getStudentByVkId(ctx.message.user_id);
					if (Student && Student.class.toString() === classId.toString()) {
						await Student.updateOne({ role: Roles.contributor });

						ctx.reply(
							'Пользователь стал редактором',
							null,
							await createDefaultKeyboard(Student),
						);
						ctx.scene.enter(sceneNames.default);
					} else {
						ctx.reply(
							'Что бы сделать пользователя редактором, он должен быть учеником вашего класса',
							null,
							await createDefaultKeyboard(Student),
						);
						ctx.scene.enter(sceneNames.default);
					}
				}
			} else {
				ctx.reply('Неверный id');
			}
		} catch (e) {
			ctx.scene.enter(sceneNames.error);
			console.error(e);
		}
	},
);
module.exports = addRedactorScene;
