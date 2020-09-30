const { mapHomeworkByLesson } = require('bot-database/utils/functions');
const { DataBase: DB } = require('bot-database/DataBase');
const config = require('../config.js');
const { monthsRP, createDefaultKeyboardSync } = require('./messagePayloading');
const { Roles, Lessons } = require('bot-database/Models/utils');
const botCommands = require('./botCommands');
const Markup = require('node-vk-bot-api/lib/markup');

const mapListToKeyboard = (list) => {
	return Markup.keyboard(
		list.map((value) => Markup.button(value)),
		{ columns: calculateColumnsAmount(list.length) },
	);
};

const DataBase = new DB(config['MONGODB_URI']);

const sceneInfoInSession = ['nextScene', 'pickFor', 'backScene', 'step', 'backStep'];
const userDataInSession = ['role', 'userId', 'fullName', 'firstScene', 'secondScene'];
const dataForSceneInSession = [
	'Class',
	'Student',
	'newHomework',
	'newAnnouncement',
	'isFullFill',
	'schedule',
	'changingDay',
	'classes',
	'enteredDayIndexes',
	'changed',
	'possibleLessons',
	'homework',
	'students',
];

async function notifyAboutReboot(botInstance) {
	try {
		const studentsIdsAndRoles = await DataBase.getAllStudents().then((students) =>
			students.map(({ vkId, role }) => ({ vkId, role })),
		);

		for (const { role, vkId } of studentsIdsAndRoles) {
			const res = await botInstance.execute('messages.getHistory', {
				count: 1,
				user_id: vkId,
				extended: 1,
			});

			if (!res || (res.items[0] && !isStudentOnDefaultScene(res))) {
				setTimeout(
					async () =>
						botInstance.sendMessage(
							[vkId],
							botCommands.botWasRebooted,
							null,
							await createDefaultKeyboardSync(role),
						),
					50,
				);
			}
		}
	} catch (e) {
		console.error(e);
	}
}
function isStudentOnDefaultScene(res) {
	const messageMatches =
		res.items[0].text.startsWith('Mеню') ||
		res.items[0].text === botCommands.botWasRebooted ||
		res.items[0].text.startsWith('Задание на') ||
		new RegExp(`^(${Lessons.join('|')}):`, 'i').test(res.items[0].text);

	const messageIsFromBot = -res.items[0].from_id === +config['GROUP_ID'];

	return messageMatches && messageIsFromBot;
}

async function notifyStudents(botInstance) {
	try {
		const Classes = await DataBase.getAllClasses();

		for (const Class of Classes) {
			await sendHomeworkToClassStudents(Class, botInstance);
		}
	} catch (e) {
		console.error(e);
	}
}
async function sendHomeworkToClassStudents(Class, botInstance) {
	try {
		const { students } = await DataBase.populate(Class);
		if (students?.length) {
			const daysOffsets = new Set(
				students.map(({ settings }) => settings.daysForNotification).flat(),
			);

			for (const dayOffset of daysOffsets) {
				const notifiableIds = getNotifiableIds(
					students.filter(({ settings }) =>
						settings.daysForNotification.includes(dayOffset),
					),
				);

				if (notifiableIds.length > 0) {
					const dateWithOffset = getDateWithOffset(dayOffset);
					const dayHomework = await DataBase.getHomeworkByDate(Class, dateWithOffset);

					if (dayHomework.length > 0) {
						const parsedHomework = mapHomeworkByLesson(dayHomework);

						sendHomework(parsedHomework, botInstance, notifiableIds);

						setTimeout(() => {
							let message = `Задание на ${getTomorrowOrAfterTomorrowOrDateString(
								dateWithOffset,
							)}\n`;
							botInstance.sendMessage(notifiableIds, message);
						}, (dayHomework.length + 1) * 50);
					}
				}
			}
		}
	} catch (e) {
		console.error(e);
	}
}

function getTomorrowOrAfterTomorrowOrDateString(date) {
	if (isOneDay(date, getTomorrowDate())) return 'завтра';
	else if (isOneDay(date, getDateWithOffset(2))) return 'послезавтра';
	else return getDayMonthString(date);
}

function getNotifiableIds(students) {
	const ids = [];

	for (const {
		settings: { notificationsEnabled, notificationTime },
		lastHomeworkCheck,
		vkId,
	} of students) {
		// if (notificationsEnabled) {
		// 	const [hours, mins] = notificationTime
		// 		.match(/([0-9]+):([0-9]+)/)
		// 		.slice(1)
		// 		.map(Number);

		// 	if (isReadyToNotificate(hours, mins, lastHomeworkCheck)) {
		// 		ids.push(vkId);
		// 		DataBase.changeLastHomeworkCheckDate(vkId, new Date());
		// 	}
		// }
		ids.push(vkId);
	}

	return ids;
}
function isReadyToNotificate(hours, mins, lastHomeworkCheck) {
	const hoursNow = new Date().getHours();
	const minsNow = new Date().getMinutes();

	return hours <= hoursNow && mins <= minsNow && !isToday(lastHomeworkCheck);
}

function sendHomework(parsedHomework, botInstance, notifiableIds) {
	if (notifiableIds.length > 0) {
		let index = 1;

		for (const [lesson, homework] of parsedHomework) {
			let { homeworkMessage, attachments } = getHomeworkPayload(lesson, homework);

			setTimeout(() => {
				botInstance.sendMessage(notifiableIds, homeworkMessage, attachments);
			}, index++ * 15);
		}
	}
}
function getHomeworkPayload(lesson, homework) {
	let homeworkMessage = `${lesson}:\n`;
	let attachments = [];

	for (let i = 0; i < homework.length; i++) {
		const hw = homework[i];
		homeworkMessage += hw.text ? `${i + 1}: ${hw.text}\n` : '';
		attachments = attachments.concat(hw.attachments?.map(({ value }) => value));
	}
	return { homeworkMessage, attachments };
}

function findMaxPhotoResolution(photo) {
	let maxR = 0;
	let url = '';

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
}

function getDateWithOffset(offset) {
	const date = new Date();
	return new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset);
}
function getTomorrowDate() {
	return getDateWithOffset(1);
}

function isOneDay(aDate, bDate) {
	return (
		aDate.getFullYear() === bDate.getFullYear() &&
		aDate.getMonth() === bDate.getMonth() &&
		aDate.getDate() === bDate.getDate()
	);
}
function isToday(date) {
	return isOneDay(date, new Date());
}

function inRange(number, min, max) {
	if (min !== undefined && min > number) {
		return false;
	}
	if (max !== undefined && max < number) {
		return false;
	}

	return true;
}

function filterContentByDate(content, date) {
	return content.filter(({ to }) => {
		return inRange(to.getTime() - date.getTime(), 0, 24 * 60 * 60 * 1000 - 1);
	});
}

function getDayMonthString(date) {
	return `${date.getDate()} ${monthsRP[date.getMonth()]}`;
}

function calculateColumnsAmount(amountOfItems) {
	if (amountOfItems % 3 === 0) return 3;
	else if (amountOfItems % 2 === 0) return 2;
	else return 4;
}

function cleanSession(ctx) {
	cleanDataForSceneFromSession(ctx);
	cleanSceneInfoFromSession(ctx);
}
function cleanSceneInfoFromSession(ctx) {
	for (const pole of sceneInfoInSession) {
		delete ctx[pole];
	}
}
function cleanDataForSceneFromSession(ctx) {
	for (const pole of dataForSceneInSession) {
		ctx[pole] = undefined;
	}
}
function cleanUserInfoFromSession(ctx) {
	for (const pole of userDataInSession) {
		ctx[pole] = undefined;
	}
}

function isValidClassName(name) {
	if (/(^\d{2})([A-Z]|[А-Я])/i.test(name) && name.match(/(^\d{2})([A-Z]|[А-Я])/i)[0] === name) {
		const [_, digit] = name.match(/(^\d{2})([A-Z]|[А-Я])/i);
		return +digit > 0 && +digit <= 11 && Number.isInteger(+digit);
	}
	return false;
}

module.exports = {
	isValidClassName,
	isToday,
	getTomorrowDate,
	notifyStudents,
	findMaxPhotoResolution,
	sendHomeworkToClassStudents,
	getNotifiableIds,
	isReadyToNotificate,
	sendHomework,
	getHomeworkPayload,
	inRange,
	filterContentByDate,
	getDayMonthString,
	cleanSession,
	cleanUserInfoFromSession,
	cleanDataForSceneFromSession,
	cleanSceneInfoFromSession,
	calculateColumnsAmount,
	notifyAboutReboot,
	mapListToKeyboard,
};
