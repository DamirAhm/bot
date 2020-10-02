// @ts-nocheck
const VkBot = require('node-vk-bot-api'),
	Session = require('node-vk-bot-api/lib/session'),
	Stage = require('node-vk-bot-api/lib/stage'),
	{ TOKEN, MONGODB_URI, VK_API_KEY, GROUP_ID, ALBUM_ID } = require('./config.js'),
	{ DataBase: DB } = require('bot-database/DataBase.js'),
	VK_API = require('bot-database/VkAPI/VK_API'),
	Scenes = require('./Scenes.js'),
	botCommands = require('./utils/botCommands.js'),
	http = require('http'),
	{ notifyStudents, notifyAboutReboot } = require('./utils/functions');

const DataBase = new DB(MONGODB_URI);
const server = http.createServer(requestListener);
const bot = new VkBot({
	token: TOKEN,
	group_id: GROUP_ID,
});

DataBase.connect(
	{
		useNewUrlParser: true,
		useUnifiedTopology: true,
		useCreateIndex: true,
	},
	async () => {
		console.log('Mongoose connected');
		server.listen(process.env.PORT || 1337);
		bot.startPolling();

		notifyAboutReboot(bot);

		notifyStudents(bot);
		setInterval(() => notifyStudents(bot), 1000 * 60);
	},
);

const vk = new VK_API([VK_API_KEY, GROUP_ID, ALBUM_ID]);

const session = new Session();
const stage = new Stage(...Object.values(Scenes));
bot.use(session.middleware());
bot.use(stage.middleware());

bot.command(/.*/, async (ctx, next) => {
	const Student = await DataBase.getStudentByVkId(ctx.message.user_id);

	if (Student) next();
	else {
		const { first_name: first_name, last_name: last_name } = await bot
			.execute('users.get', { user_ids: [ctx.message.user_id] })
			.then((res) => res[0]);

		ctx.session.userId = ctx.message.user_id;
		ctx.session.lastName = last_name;
		ctx.session.firstName = first_name;

		ctx.scene.enter('register');
	}
});

bot.command(
	['start', 'начать', 'help', 'помощь', 'меню', botCommands.back, botCommands.no],
	async (ctx) => {
		try {
			const {
				message: { user_id },
			} = ctx;
			let student = await DataBase.getStudentByVkId(user_id);

			if (student) {
				if (!student.firstName || !student.secondName || !student.fullName) {
					const { first_name, last_name } = await vk
						.getUser(user_id)
						.then((res) => res[0]);
					student.firstName = first_name;
					student.secondName = last_name;
					student.secondName = first_name + ' ' + last_name;

					await student.save();
				}

				ctx.session.userId = student.vkId;
				ctx.session.role = student.role;
				ctx.session.secondName = student.secondName;
				ctx.session.firstName = student.firstName;
				ctx.session.fullName = student.fullName;

				if (student.registered) {
					ctx.scene.enter('default');
				} else {
					ctx.reply('Привет ' + student.firstName + ' ' + student.lastName);
					ctx.scene.enter('register');
				}
			} else {
				const {
					first_name: first_name,
					last_name: last_name,
				} = await bot
					.execute('users.get', { user_ids: [ctx.message.user_id] })
					.then((res) => res[0]);

				ctx.session.userId = user_id;
				ctx.session.secondName = last_name;
				ctx.session.firstName = first_name;

				ctx.scene.enter('register');
			}
		} catch (e) {
			console.error(e.message);
			throw new Error(e);
		}
	},
);

bot.command(botCommands.adminPanel, (ctx) => ctx.scene.enter('adminPanel'));
bot.command(botCommands.contributorPanel, (ctx) => ctx.scene.enter('contributorPanel'));
bot.command(botCommands.back, (ctx) => ctx.scene.enter('default'));
bot.command(botCommands.toStart, (ctx) => ctx.scene.enter('default'));

bot.command(botCommands.checkHomework, (ctx) => ctx.scene.enter('checkHomework'));
bot.command(botCommands.checkAnnouncements, (ctx) => ctx.scene.enter('checkAnnouncements'));
bot.command(botCommands.checkSchedule, (ctx) => ctx.scene.enter('checkSchedule'));

bot.command(botCommands.settings, (ctx) => ctx.scene.enter('settings'));

bot.command(botCommands.giveFeedback, (ctx) => ctx.scene.enter('giveFeedback'));

bot.command(/.+/, (ctx) => ctx.reply(botCommands.notUnderstood));

function requestListener(req, res) {
	res.writeHead(200);
	res.end('Hello, World!');
}
