//@ts-check
const { mapHomeworkByLesson } = require('bot-database/build/utils/functions');
const { DataBase: DB, VK_API } = require('bot-database');
const config = require('../config.js');
const { Roles, Lessons } = require('bot-database');
const botCommands = require('./botCommands');
const Markup = require('node-vk-bot-api/lib/markup');
const {
	createUserInfo,
	mapListToMessage,
	parseAttachmentsToVKString,
	createBackKeyboard,
} = require('./messagePayloading.js');
const { daysOfWeek } = require('bot-database/build/Models/utils');
const { retranslit, translit } = require('./translits.js');

const mapListToKeyboard = (
	/** @type {any[]} */ list,
	{ trailingButtons = [], leadingButtons = [] } = {},
) => {
	if ([trailingButtons, leadingButtons].every((btns) => Array.isArray(btns[0]) || !btns.length)) {
		return Markup.keyboard(
			[
				...leadingButtons,
				list.map((/** @type {any} */ value) => Markup.button(value)),
				...trailingButtons,
			],
			{ columns: calculateColumnsAmount(list.length) },
		);
	} else {
		return Markup.keyboard(
			[
				...leadingButtons,
				...list.map((/** @type {any} */ value) => Markup.button(value)),
				...trailingButtons,
			],
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
const maxDatesPerMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
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
const createDefaultKeyboardSync = (/** @type {Roles} */ role) => {
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
const vk = new VK_API(process.env.VK_API_KEY, +config['GROUP_ID'], +config['ALBUM_ID']);

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

/**
 * @param {string} schoolName
 */
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

					await DataBase.removeOldHomework(
						{ classNameOrInstance: className, schoolName },
						dateWeekBefore,
					);
					await DataBase.removeOldAnnouncements(
						{ classNameOrInstance: className, schoolName },
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

/**
 * @param {{ items: { text: string; from_id: number; }[]; }} res
 */
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

/**
 * @param {any} botInstance
 */
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
/**
 * @param {import("bot-database/build/types").ClassDocument} Class
 * @param {any} botInstance
 */
async function sendHomeworkToClassStudents(Class, botInstance) {
	try {
		debugger;
		const { students } = await DataBase.populate(Class);

		if (students?.length) {
			const additionalDayOffsets = dayOffsetsToAddAccordingToPreferences(Class.homework);
			const daysOffsets = new Set([
				...students.map(({ settings }) => settings.daysForNotification).flat(),
				...Object.keys(additionalDayOffsets).map(Number),
			]);

			let notified = [];

			for (const dayOffset of daysOffsets) {
				const studentsOnDayOffset = students.filter(
					({ settings, vkId }) =>
						settings.daysForNotification.includes(dayOffset) ||
						additionalDayOffsets[dayOffset]?.includes(vkId.toString()),
				);

				const dateWithOffset = getDateWithOffset(dayOffset);
				const dayHomework = await DataBase.getHomeworkByDate(
					{ classNameOrInstance: Class, schoolName: Class.schoolName },
					dateWithOffset,
				);

				if (dayHomework.length > 0) {
					const {
						studentsWithoutPreferences,
						homeworkForEachStudent,
					} = getNotifiableIdsWithHomeworkForEach(studentsOnDayOffset, dayHomework);
					notified = notified.concat([...new Set([...studentsWithoutPreferences])]);

					let delayAfterStudentWithPreferences = 0;

					for (const vkId in homeworkForEachStudent) {
						const homeworkForStudent = homeworkForEachStudent[vkId];
						if (homeworkForStudent.length > 0) {
							delayAfterStudentWithPreferences += homeworkForStudent.length + 1;
							const parsedHomework = mapHomeworkByLesson(homeworkForStudent);

							sendHomework(parsedHomework, botInstance, [+vkId]);

							setTimeout(() => {
								let message = `Задание на ${getTomorrowOrAfterTomorrowOrDateString(
									dateWithOffset,
								)}\n`;
								botInstance.sendMessage([+vkId], message);
							}, (homeworkForStudent.length + 1) * 50);
							notified.push(+vkId);
						}
					}

					setTimeout(() => {
						if (dayHomework.length > 0 && studentsWithoutPreferences.length > 0) {
							const parsedHomework = mapHomeworkByLesson(dayHomework);

							sendHomework(parsedHomework, botInstance, studentsWithoutPreferences);

							setTimeout(() => {
								let message = `Задание на ${getTomorrowOrAfterTomorrowOrDateString(
									dateWithOffset,
								)}\n`;
								botInstance.sendMessage(studentsWithoutPreferences, message);
							}, (dayHomework.length + 1) * 50);
						}
					}, delayAfterStudentWithPreferences * 50);
				}

				for (const vkId of notified) {
					DataBase.changeLastHomeworkCheckDate(vkId, new Date());
				}
			}
		}
	} catch (e) {
		console.error(e);
	}
}

/**
 * @param {Date} date
 */
function getTomorrowOrAfterTomorrowOrDateString(date) {
	if (isOneDay(date, getTomorrowDate())) return 'завтра';
	else if (isOneDay(date, getDateWithOffset(2))) return 'послезавтра';
	else return getDayMonthString(date);
}

/**
 * @param {import("bot-database/build/types").StudentDocument[]} students
 * @param {import("bot-database/build/types").IHomework[]} homework
 */
function getNotifiableIdsWithHomeworkForEach(students, homework) {
	/**
	 * @type {{[key: number]: import("bot-database/build/types").IHomework[]}} homeworkForEachStudent
	 */
	const homeworkForEachStudent = {};
	const studentsWithoutPreferences = [];

	for (const {
		lastHomeworkCheck,
		vkId,
		settings: { notificationsEnabled, notificationTime },
	} of students) {
		if (homework.every((hw) => hw.userPreferences[vkId] === undefined)) {
			if (notificationsEnabled) {
				const [_, hours, mins] = notificationTime.match(/([0-9]+):([0-9]+)/).map(Number);

				if (isReadyToNotificate(hours, mins, lastHomeworkCheck)) {
					studentsWithoutPreferences.push(vkId);
				}
			}
		} else {
			const homeworkForStudent = homework.filter((hw) => {
				if (hw.userPreferences[vkId] !== undefined) {
					const studentNotificationTime =
						hw.userPreferences[vkId].notificationTime ?? notificationTime;
					const studentNotificationsEnabled =
						hw.userPreferences[vkId].notificationEnabled ?? notificationsEnabled;

					if (studentNotificationsEnabled) {
						const [_, hours, mins] = studentNotificationTime
							.match(/([0-9]+):([0-9]+)/)
							.map(Number);

						return isReadyToNotificate(hours, mins, lastHomeworkCheck);
					}
				}
			});

			homeworkForEachStudent[vkId] = homeworkForStudent;
		}
	}

	return {
		homeworkForEachStudent,
		studentsWithoutPreferences,
	};
}
/**
 * @param {number} hours
 * @param {number} mins
 * @param {Date} lastHomeworkCheck
 */
function isReadyToNotificate(hours, mins, lastHomeworkCheck) {
	const hoursNow = new Date().getHours();
	const minsNow = new Date().getMinutes();

	return hours <= hoursNow && mins <= minsNow && !isToday(lastHomeworkCheck);
}

/**
 * @param {[string, import("bot-database/build/types").IHomework[]][]} parsedHomework
 * @param {any} botInstance
 * @param {number[]} notifiableIds
 */
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
/**
 * @param {import("bot-database/build/types").IHomework[]} homework
 */
function dayOffsetsToAddAccordingToPreferences(homework) {
	/**
	 * @type {{[key: number]: string[]}}
	 */
	let dayOffsets = {};
	const userPreferences = homework.map(({ userPreferences }) => userPreferences);

	for (const preference of userPreferences) {
		if (Object.keys(preference).length > 0) {
			for (const vkId in preference) {
				if (
					preference[vkId] !== undefined &&
					preference[vkId].notificationEnabled !== false &&
					preference[vkId].daysForNotification !== null
				) {
					preference[vkId].daysForNotification.forEach((dayOffset) =>
						dayOffsets[dayOffset]
							? dayOffsets[dayOffset].push(vkId)
							: (dayOffsets[dayOffset] = [vkId]),
					);
				}
			}
		}
	}

	return dayOffsets;
}
/**
 * @param {any} lesson
 * @param {import("bot-database/build/types").IHomework[]} homework
 */
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

/**
 * @param {import("bot-database/build/VkAPI/VK_API").getVkPhotoResponse} photo
 */
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

/**
 * @param {number} offset
 * @param {Date?} root
 */
function getDateWithOffset(offset, root = new Date()) {
	const date = root;
	return new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset);
}
function getTomorrowDate() {
	return getDateWithOffset(1);
}

/**
 * @param {Date} aDate
 * @param {Date} bDate
 */
function isOneDay(aDate, bDate) {
	return (
		aDate.getFullYear() === bDate.getFullYear() &&
		aDate.getMonth() === bDate.getMonth() &&
		aDate.getDate() === bDate.getDate()
	);
}
/**
 * @param {Date} date
 */
function isToday(date) {
	return isOneDay(date, new Date());
}

/**
 * @param {number} number
 * @param {number} min
 * @param {number} max
 */
function inRange(number, min, max) {
	if (min !== undefined && min > number) {
		return false;
	}
	if (max !== undefined && max < number) {
		return false;
	}

	return true;
}

/**
 * @param {import("bot-database/build/types").IContent[]} content
 * @param {{ getTime: () => number; }} date
 */
function filterContentByDate(content, date) {
	return content.filter(({ to }) => {
		return inRange(to.getTime() - date.getTime(), 0, 24 * 60 * 60 * 1000 - 1);
	});
}

/**
 * @param {Date} date
 */
function getDayMonthString(date) {
	return `${date.getDate()} ${monthsRP[date.getMonth()]}`;
}

/**
 * @param {number} amountOfItems
 */
function calculateColumnsAmount(amountOfItems) {
	if (amountOfItems % 3 === 0) return 3;
	else if (amountOfItems % 2 === 0) return 2;
	else return 4;
}

/**
 * @param {any} ctx
 */
function cleanSession(ctx) {
	cleanDataForSceneFromSession(ctx);
	cleanSceneInfoFromSession(ctx);
}
/**
 * @param {{ [x: string]: any; }} ctx
 */
function cleanSceneInfoFromSession(ctx) {
	for (const pole of sceneInfoInSession) {
		delete ctx[pole];
	}
}
/**
 * @param {{ [x: string]: any; }} ctx
 */
function cleanDataForSceneFromSession(ctx) {
	for (const pole of dataForSceneInSession) {
		ctx[pole] = undefined;
	}
}
/**
 * @param {{ [x: string]: any; }} ctx
 */
function cleanUserInfoFromSession(ctx) {
	for (const pole of userDataInSession) {
		ctx[pole] = undefined;
	}
}

/**
 * @param {string} name
 */
function isValidClassName(name) {
	if (/(^\d{2})([A-Z]|[А-Я])/i.test(name) && name.match(/(^\d{2})([A-Z]|[А-Я])/i)[0] === name) {
		const [_, digit] = name.match(/(^\d{2})([A-Z]|[А-Я])/i);
		return +digit > 0 && +digit <= 11 && Number.isInteger(+digit);
	}
	return false;
}
/**
 * @param {string} name
 */
function isValidCityName(name) {
	return /^([а-я]|[a-z])+^/i.test(name);
}
/**
 * @param {string | number} number
 */
function isValidSchoolNumber(number) {
	if (!isNaN(+number)) {
		return +number >= 0 && +number % 1 === 0;
	} else return false;
}

async function getCityNames() {
	const schools = await DataBase.getAllSchools();
	const cityNames = [
		...new Set(
			schools.map(({ name: schoolName }) => retranslit(parseSchoolName(schoolName)[0])),
		),
	];

	return cityNames;
}
/**
 * @param {string} cityName
 */
async function getSchoolNumbers(cityName) {
	const schools = await DataBase.getSchoolsForCity(translit(cityName));

	const schoolNumbers = [
		...new Set(schools.map(({ name: schoolName }) => parseSchoolName(schoolName)[1])),
	];

	return schoolNumbers;
}

/**
 * @param {{ message: { user_id: number | import("bot-database/types").StudentDocument | import("bot-database/types").PopulatedStudent; }; }} ctx
 */
async function getSchoolName(ctx) {
	return await DataBase.getSchoolForStudent(ctx.message.user_id).then((school) =>
		school ? school.name : null,
	);
}

/**
 * @param {{ session: { Student: import("bot-database/types").StudentDocument; }; message: { user_id: number; }; reply: (arg0: string, arg1: any, arg2: void) => void; }} ctx
 */
async function sendStudentInfo(ctx) {
	if (!ctx.session.Student) {
		ctx.session.Student = await DataBase.getStudentByVkId(ctx.message.user_id);
	}

	let { role, class: classId, settings, fullName = '', vkId } = ctx.session.Student;
	let className, cityName, schoolNumber;

	if (fullName === '') {
		const User = await vk.getUser(vkId.toString());
		//@ts-ignore
		if (User && (User.first_name || User.last_name)) {
			//@ts-ignore
			fullName = User.first_name + ' ' + User.last_name;

			ctx.session.Student.fullName = fullName;
		}
	}
	if (classId) {
		const Class = await DataBase.getClassBy_Id(classId);

		className = Class.name || 'Нету';
		if (!Class) {
			[cityName, schoolNumber] = ['Нету', 'Нету'];
		} else {
			[cityName = 'Нету', schoolNumber = 'Нету'] = parseSchoolName(Class.schoolName);
		}
	} else {
		[cityName, schoolNumber, className] = ['Нету', 'Нету', 'Нету'];
	}

	const message = createUserInfo({
		role,
		className,
		settings,
		name: fullName,
		cityName,
		schoolNumber,
	});

	ctx.reply(
		message,
		null,
		//@ts-ignore
		createBackKeyboard([[Markup.button(botCommands.changeSettings, 'primary')]]),
	);
}

/**
 * @param {{ session: { Class: import("bot-database/build/types").ClassDocument; possibleLessons: any[]; }; message: { user_id: number; }; }} ctx
 */
async function getPossibleLessonsAndSetInSession(ctx) {
	if (ctx.session.Class === undefined) {
		ctx.session.Class = await DataBase.getStudentByVkId(ctx.message.user_id)
			.then(({ class: classId }) => classId)
			.then((classId) => DataBase.getClassBy_Id(classId));
	}

	const possibleLessons = [...new Set(ctx.session.Class.schedule.flat().sort())];
	ctx.session.possibleLessons = possibleLessons;

	return possibleLessons;
}

/**
 * @param {import("bot-database/build/types").StudentDocument[]} Contributors
 */
function mapStudentToPreview(Contributors) {
	return Contributors.map(
		({ firstName, lastName, vkId }) => `${firstName} ${lastName} (${vkId})`,
	);
}

/**
 * @param {number} month
 * @param {any} day
 * @param {number} year
 */
function validateDate(month, day, year) {
	return (
		inRange(month, 1, 12) &&
		inRange(day, 1, maxDatesPerMonth[month - 1]) &&
		year >= new Date().getFullYear()
	);
}

/**
 * @param {string} body
 */
function parseDate(body) {
	return body
		.match(/([0-9]+)\.([0-9]+)\.?([0-9]+)?/)
		.slice(1)
		.map((/** @type {any} */ n) => (isNaN(Number(n)) ? undefined : Number(n)));
}
/**
 * @param {string} body
 */
function parseTime(body) {
	return body
		.match(/([0-9]+):([0-9]+)/)
		.slice(1)
		.map((/** @type {any} */ n) => (isNaN(Number(n)) ? undefined : Number(n)));
}

/**
 *@param {{schedule: string[][]}} Class
 *
 *@return {string}
 */
function getScheduleString({ schedule }) {
	const message = schedule
		.map((lessons, i) => {
			return getDayScheduleString(lessons, daysOfWeek[i]);
		})
		.join('\n\n');

	return message;
}
/**
 * @param {string[]} lessons
 * @param {string} dayName
 *
 * @return {string}
 */
function getDayScheduleString(lessons, dayName) {
	const dayMessage = lessons.length > 0 ? `${dayName}: \n ${mapListToMessage(lessons)} ` : '';

	return dayMessage;
}

//Returns amount of days for each of which whe should send homework
function getLengthOfHomeworkWeek() {
	const date = new Date().getDay();

	return date >= 5 ? 6 : 7 - date;
}

/**
 * @param {any} attachments
 */
async function mapAttachmentsToObject(attachments) {
	const mappedAttachments = [];

	for (const att of attachments) {
		mappedAttachments.push({
			value: await parseAttachmentsToVKString(att),
			url: findMaxPhotoResolution(att[att.type]),
			album_id: att[att.type].album_id,
		});
	}

	return mappedAttachments;
}

function getTextsAndAttachmentsFromForwarded({ body = '', attachments = [], fwd_messages = [] }) {
	if (fwd_messages.length === 0) {
		return {
			body: body,
			attachments: attachments,
		};
	}

	const nestedMessagesPayload = fwd_messages.reduce(({ body = '', attachments = [] }, c) => {
		const payload = getTextsAndAttachmentsFromForwarded(c);

		return {
			body: (body ? body + '\n' : '') + payload.body,
			attachments: attachments.concat(payload.attachments),
		};
	}, {});

	return {
		body: (body ? body + '\n' : '') + nestedMessagesPayload.body,
		attachments: attachments.concat(nestedMessagesPayload.attachments),
	};
}

module.exports = {
	isValidCityName,
	isValidSchoolNumber,
	parseSchoolName,
	getDateWithOffset,
	isValidClassName,
	isToday,
	getTomorrowDate,
	notifyStudents,
	findMaxPhotoResolution,
	sendHomeworkToClassStudents,
	getNotifiableIdsWithHomeworkForEach,
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
	getCityNames,
	getSchoolNumbers,
	getSchoolName,
	sendStudentInfo,
	getPossibleLessonsAndSetInSession,
	mapStudentToPreview,
	validateDate,
	parseDate,
	parseTime,
	getScheduleString,
	getDayScheduleString,
	getLengthOfHomeworkWeek,
	mapAttachmentsToObject,
	getTextsAndAttachmentsFromForwarded,
};
