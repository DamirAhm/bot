// @ts-nocheck
const VkBot = require("node-vk-bot-api"),
    Session = require("node-vk-bot-api/lib/session"),
    Stage = require("node-vk-bot-api/lib/stage"),
    config = require("./config.json"),
    { DataBase: DB } = require("bot-database/DataBase.js"),
    {
        dayInMilliseconds,
        mapHomeworkByLesson,
    } = require("bot-database/utils/functions"),
    bot = new VkBot(config["ALT_TOKEN"]),
    VK_API = require("bot-database/VkAPI/VK_API"),
    Scenes = require("./Scenes.js"),
    botCommands = require("./utils/botCommands.js"),
    http = require("http"),
    { notifyStudents } = require("./utils.js");

const DataBase = new DB(config["MONGODB_URI"]);
const server = http.createServer(requestListener);

DataBase.connect(
    {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        useCreateIndex: true,
    },
    async () => {
        console.log("Mongoose connected");
        server.listen(process.env.PORT || 8080);
        bot.startPolling();
        notifyStudents(bot);
        setInterval(() => notifyStudents(bot), 1000 * 60);
    }
);

const vk = new VK_API(
    config["VK_API_KEY"],
    config["GROUP_ID"],
    config["ALBUM_ID"]
);

const session = new Session();
const stage = new Stage(...Object.values(Scenes));

bot.use(session.middleware());
bot.use(stage.middleware());

bot.command(/start|начать|меню|help|помощь/i, async (ctx) => {
    try {
        const {
            message: { user_id },
        } = ctx;
        let student = await DataBase.getStudentByVkId(user_id);

        if (student) {
            if (student.firstName || student.secondName) {
                const { first_name, last_name } = await vk
                    .getUser(user_id)
                    .then((res) => res[0]);
                student.firstName = first_name;
                student.secondName = last_name;
                await student.save();
            }

            ctx.session.userId = student.vkId;
            ctx.session.role = student.role;
            ctx.session.secondName = student.secondName;
            ctx.session.firstName = student.firstName;
            ctx.session.fullName = student.fullName;

            if (student.registered) {
                ctx.scene.enter("start");
            } else {
                ctx.reply(
                    "Привет " + student.firstName + " " + student.lastName
                );
                ctx.scene.enter("register");
            }
        } else {
            const {
                first_name: firstName,
                last_name: lastName,
            } = await vk.getUser(user_id).then((res) => res[0]);
            student = await DataBase.createStudent(user_id, {
                firstName,
                lastName,
            });

            ctx.session.userId = student.vkId;
            ctx.session.role = student.role;
            ctx.session.secondName = student.secondName;
            ctx.session.firstName = student.firstName;

            ctx.scene.enter("register");
        }
    } catch (e) {
        console.log(e.message);
    }
});

bot.command(botCommands.adminPanel, (ctx) => ctx.scene.enter("adminPanel"));
bot.command(botCommands.contributorPanel, (ctx) =>
    ctx.scene.enter("contributorPanel")
);
bot.command(botCommands.back, (ctx) => ctx.scene.enter("default"));
bot.command(botCommands.toStart, (ctx) => ctx.scene.enter("default"));

bot.command(botCommands.checkHomework, (ctx) =>
    ctx.scene.enter("checkHomework")
);
bot.command(botCommands.checkChanges, (ctx) => ctx.scene.enter("checkChanges"));
bot.command(botCommands.checkSchedule, (ctx) =>
    ctx.scene.enter("checkSchedule")
);

bot.command(botCommands.settings, (ctx) => ctx.scene.enter("settings"));

bot.command(/.+/, (ctx) => ctx.reply(botCommands.notUnderstood));

function requestListener(req, res) {
    res.writeHead(200);
    res.end("Hello, World!");
}
