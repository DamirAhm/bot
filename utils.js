const { mapHomeworkByLesson } = require("bot-database/utils/functions");
const { DataBase: DB } = require("bot-database/DataBase");
const config = require("./config.json");

const DataBase = new DB(config["MONGODB_URI"]);

const dayInMilliseconds = 24 * 60 * 60 * 1000;

const getTomorrowDate = () =>
    new Date(new Date().setDate(new Date().getDate() + 1));

const isToday = (date) =>
    Math.abs(date.getTime() - new Date().getTime()) <= dayInMilliseconds &&
    date.getDate() === new Date().getDate();

const notifyStudents = async (botInstance) => {
    try {
        console.log("Notifying");
        const Classes = await DataBase.getAllClasses();

        for (const Class of Classes) {
            const tomorrowHomework = await DataBase.getHomeworkByDate(
                Class,
                getTomorrowDate()
            );

            const ids = [];

            if (tomorrowHomework.length > 0) {
                const { students } = await Class.populate(
                    "students"
                ).execPopulate();

                for (const student of students) {
                    if (student.settings.notificationsEnabled) {
                        const [hours, mins] = student.settings.notificationTime
                            .match(/([0-9]+):([0-9]+)/)
                            .slice(1)
                            .map(Number);

                        const hoursNow = new Date().getHours();
                        const minsNow = new Date().getMinutes();

                        if (
                            hours <= hoursNow &&
                            mins <= minsNow &&
                            !isToday(student.lastHomeworkCheck)
                        ) {
                            ids.push(student.vkId);
                            student.lastHomeworkCheck = new Date();
                            student.save();
                        }
                    }
                }

                const parsedHomework = mapHomeworkByLesson(tomorrowHomework);
                let message = `Задание на завтра\n`;

                botInstance.sendMessage(ids, message);

                let c = 0;
                for (const [lesson, homework] of parsedHomework) {
                    let homeworkMsg = `${lesson}:\n`;
                    let attachments = [];
                    for (let i = 0; i < homework.length; i++) {
                        const hw = homework[i];
                        homeworkMsg += hw.text ? `${i + 1}: ${hw.text}\n` : "";
                        attachments = attachments.concat(
                            hw.attachments?.map(({ value }) => value)
                        );
                    }

                    await setTimeout(
                        () =>
                            botInstance.sendMessage(
                                ids,
                                homeworkMsg,
                                attachments
                            ),
                        ++c * 15
                    );
                }

                return parsedHomework;
            }
        }
    } catch (e) {
        console.error(e);
    }
};

const findMaxPhotoResolution = (photo) => {
    let maxR = 0;
    let url = "";

    for (let i in photo) {
        if (photo.hasOwnProperty(i) && /photo_\d/.test(i)) {
            const [_, res] = i.match(/photo_(\d)/);

            if (+res > maxR) {
                maxR = +res;
                url = photo[i];
            }
        }
    }

    return url;
};

module.exports = {
    isToday,
    getTomorrowDate,
    notifyStudents,
    findMaxPhotoResolution,
};
