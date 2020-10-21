// @ts-nocheck
const VkBot = require('node-vk-bot-api'),
	Session = require('node-vk-bot-api/lib/session'),
	Stage = require('node-vk-bot-api/lib/stage'),
	{ TOKEN, MONGODB_URI, VK_API_KEY, GROUP_ID, ALBUM_ID } = require('./config.js'),
	{ VK_API, Roles, DataBase: DB } = require('bot-database'),
	Scenes = require('./Scenes.js'),
	botCommands = require('./utils/botCommands.js'),
	http = require('http'),
	{ notifyStudents, notifyAboutReboot, removeOldHomework } = require('./utils/functions'),
	{
		userOptions,
		contributorOptions,
		adminOptions,
		parseAttachmentsToVKString,
	} = require('./utils/messagePayloading');

const userOptionsMessageTexts = userOptions.map(({ label }) => label);
const contributorOptionsMessageTexts = contributorOptions.map(({ label }) => label);
const adminOptionsMessageTexts = adminOptions.map(({ label }) => label);

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
		setInterval(() => notifyStudents(bot), 60 * 1000);

		removeOldHomework();
		setInterval(() => removeOldHomework(), 24 * 60 * 60 * 1000);
	},
);

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

bot.command(botCommands.back, (ctx) => ctx.scene.enter('default'));
bot.command(botCommands.toStart, (ctx) => ctx.scene.enter('default'));

bot.command(/.+/, async (ctx) => {
	const role = await DataBase.getRole(ctx.message.user_id);

	if (userOptionsMessageTexts.includes(ctx.message.body)) {
		const option = userOptions.find(({ label }) => label === ctx.message.body);

		if (option) {
			ctx.scene.enter(option.payload);
			return;
		}
	} else if (
		contributorOptionsMessageTexts.includes(ctx.message.body) &&
		[Roles.contributor, Roles.admin].includes(role)
	) {
		const option = contributorOptions.find(({ label }) => label === ctx.message.body);
		if (option) {
			ctx.scene.enter(option.payload);
			return;
		}
	} else if (
		adminOptionsMessageTexts.includes(ctx.message.body) &&
		[Roles.admin].includes(role)
	) {
		const option = adminOptions.find(({ label }) => label === ctx.message.body);

		if (option) {
			ctx.scene.enter(option.payload);
			return;
		}
	}

	ctx.reply(botCommands.notUnderstood);
});

function requestListener(req, res) {
	res.writeHead(200);
	res.end('Hello, World!');
}
