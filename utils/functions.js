const { mapHomeworkByLesson } = require('bot-database/lib/utils/functions');
const { DataBase: DB } = require('bot-database');
const config = require('../config.js');
const { Roles, Lessons } = require('bot-database');
const botCommands = require('./botCommands');
const Markup = require('node-vk-bot-api/lib/markup');

const mapListToKeyboard = (list, { trailingButtons = [], leadingButtons = [] } = {}) => {
	if ([trailingButtons, leadingButtons].every((btns) => Array.isArray(btns[0]) || !btns.length)) {
		return Markup.keyboard(
			[...leadingButtons, list.map((value) => Markup.button(value)), ...trailingButtons],
			{ columns: calculateColumnsAmount(list.length) },
		);
	} else {
		return Markup.keyboard(
			[...leadingButtons, ...list.map((value) => Markup.button(value)), ...trailingButtons],
			{ columns: calculateColumnsAmount(list.length) },
		);
	}
};

//! Копировал из messagePayloading потому что не работает из за циклических зависимостей
//Родительный падеж
const monthsRP = [
	'января',
	'февраля',
	'марта',
	'апреля',
	'мая',
	'июня',
	'июля',
	'августа',
	'сентября',
	'октября',
	'ноября',
	'декабря',
];
const userOptions = [
	{
		label: botCommands.checkHomework,
		payload: 'checkHomework',
		color: 'primary',
	},
	{
		label: botCommands.checkAnnouncements,
		payload: 'checkAnnouncements',
		color: 'primary',
	},
	{
		label: botCommands.checkSchedule,
		payload: 'checkSchedule',
		color: 'primary',
	},
	{
		label: botCommands.settings,
		payload: 'settings',
		color: 'primary',
	},
	{
		label: botCommands.giveFeedback,
		payload: 'giveFeedback',
		color: 'secondary',
	},
];
const createDefaultKeyboardSync = (role) => {
	let buttons = userOptions.map(({ label, payload, color }) =>
		Markup.button(label, color, { button: payload }),
	);

	if ([Roles.contributor, Roles.admin].includes(role)) {
		buttons.push(
			Markup.button(botCommands.contributorPanel, 'primary', {
				button: 'contributorPanel',
			}),
		);
	}
	if (role === Roles.admin) {
		buttons.push(
			Markup.button(botCommands.adminPanel, 'positive', {
				button: 'adminMenu',
			}),
		);
	}

	return Markup.keyboard(buttons, { columns: buttons.length > 2 ? 2 : 1 });
};

const DataBase = new DB(process.env.MONGODB_URI);

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
	'cityNames',
	'cityName',
	'changedCity',
];

const ruToEngTranslits = {
	а: 'a',
	б: 'b',
	в: 'v',
	г: 'g',
	д: 'd',
	е: 'e',
	ё: 'yo',
	ж: 'zh',
	з: 'z',
	и: 'i',
	й: 'y',
	к: 'k',
	л: 'l',
	м: 'm',
	н: 'n',
	о: 'o',
	п: 'p',
	р: 'r',
	с: 's',
	т: 't',
	у: 'u',
	ф: 'f',
	х: 'h',
	ц: 'c',
	ч: 'ch',
	ш: 'sh',
	щ: "sh'",
	ъ: '',
	ы: 'i',
	ь: '',
	э: 'e',
	ю: 'yu',
	я: 'ya',
};
const engToRuTranslits = {
	a: 'а',
	b: 'б',
	v: 'в',
	g: 'г',
	d: 'д',
	e: 'е',
	yo: 'ё',
	zh: 'ж',
	z: 'з',
	i: 'и',
	y: 'й',
	k: 'к',
	l: 'л',
	m: 'м',
	n: 'н',
	o: 'о',
	p: 'п',
	r: 'р',
	s: 'с',
	t: 'т',
	u: 'у',
	f: 'ф',
	h: 'х',
	c: 'ц',
	ch: 'ч',
	sh: 'ш',
	"sh'": 'щ',
	oo: 'у',
	ee: 'и',
	yu: 'ю',
	ya: 'я',
};
function translit(rusWord) {
	if (rusWord && typeof rusWord === 'string') {
		return rusWord
			.split('')
			.map((w) => ruToEngTranslits[w.toLowerCase()] || w.toLowerCase())
			.join('');
	} else {
		return '';
	}
}
function retranslit(engWord) {
	if (engWord && typeof engWord === 'string') {
		if (/(ch|sh|zh|sh\'|yo|yu|ya|oo|ee).test(engWord)/) {
			for (const i of ['ch', 'sh', 'zh', "sh'", 'yo', 'yu', 'ya', 'oo', 'ee']) {
				engWord = engWord.replace(new RegExp(i, 'g'), engToRuTranslits[i]);
			}
		}
		for (const i of Object.keys(engToRuTranslits)) {
			engWord = engWord.replace(new RegExp(i, 'g'), engToRuTranslits[i]);
		}

		return engWord;
	} else {
		return '';
	}
}

const capitalize = (str) => (str ? str[0].toUpperCase() + str.slice(1) : '');

function parseSchoolName(schoolName) {
	const match = schoolName?.match(/^([a-z]+):(\d+)/);
	if (match != null) {
		const [_, city, number] = match;

		if (!isNaN(+number)) {
			return [city, number];
		} else {
			return null;
		}
	}
	return null;
}

async function removeOldHomework() {
	try {
		const Classes = await DataBase.getAllClasses();

		for (const { homework, name: className, schoolName } of Classes) {
			if (className === '11Б') {
				if (homework.length) {
					const dateWeekBefore = getDateWeekBefore();

					await DataBase.removeOldHomework({ className, schoolName }, dateWeekBefore);
					await DataBase.removeOldAnnouncements(
						{ className, schoolName },
						dateWeekBefore,
					);
				}
			}
		}
	} catch (e) {
		console.error(e);
		throw e;
	}
}
function getDateWeekBefore() {
	const date = new Date();

	return new Date(date.setDate(date.getDate() - 7));
}

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
							createDefaultKeyboardSync(role),
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
	let { text, from_id } = res.items[0];

	text = text.toLowerCase().trim();

	const messageMatches =
		text.startsWith('меню') ||
		text === botCommands.botWasRebooted.toLowerCase() ||
		text.startsWith('задание на') ||
		new RegExp(`^(${Lessons.map((l) => l.toLowerCase()).join('|')}):`, 'i').test(text);
	const messageIsFromBot = -from_id === +config['GROUP_ID'];

	return messageMatches && messageIsFromBot;
}

async function notifyStudents(botInstance) {
	try {
		const Classes = await DataBase.getAllClasses();

		if (Classes) {
			for (const Class of Classes) {
				await sendHomeworkToClassStudents(Class, botInstance);
			}
		} else {
			console.error('Cant access classes from database');
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

			let notified = [];

			for (const dayOffset of daysOffsets) {
				const notifiableIds = getNotifiableIds(
					students.filter(({ settings }) =>
						settings.daysForNotification.includes(dayOffset),
					),
				);
				notified = notified.concat(notifiableIds);

				if (notifiableIds.length > 0) {
					const dateWithOffset = getDateWithOffset(dayOffset);
					const dayHomework = await DataBase.getHomeworkByDate(
						{ classNameOrInstance: Class, schoolName: Class.schoolName },
						dateWithOffset,
					);

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

			for await (const vkId of notified) {
				DataBase.changeLastHomeworkCheckDate(vkId, new Date());
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
		fullName,
	} of students) {
		if (notificationsEnabled) {
			const [_, hours, mins] = notificationTime.match(/([0-9]+):([0-9]+)/).map(Number);

			if (isReadyToNotificate(hours, mins, lastHomeworkCheck)) {
				ids.push(vkId);
			}
		}
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
function isValidCityName(name) {
	return /^([а-я]|[a-z])+^/i.test(name);
}
function isValidSchoolNumber(number) {
	if (!isNaN(+number)) {
		return +number >= 0 && +number % 1 === 0;
	} else return false;
}

module.exports = {
	isValidCityName,
	isValidSchoolNumber,
	parseSchoolName,
	getDateWithOffset,
	capitalize,
	ruToEngTranslits,
	engToRuTranslits,
	retranslit,
	translit,
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
	removeOldHomework,
	getDateWeekBefore,
};
