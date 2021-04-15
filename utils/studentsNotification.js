//@ts-check
const { mapHomeworkByLesson } = require('bot-database/build/utils/functions');
const { DataBase: DB } = require('bot-database');
const config = require('../config.js');
const { Lessons } = require('bot-database');
const botCommands = require('./botCommands');
const {
	isOneDay,
	getDateWithOffset,
	getTomorrowDate,
	getDayMonthString,
	isToday,
} = require('./dateFunctions');
const { createDefaultKeyboard } = require('./messagePayloading.js');

const DataBase = new DB(process.env.MONGODB_URI);

async function notifyAboutReboot(botInstance) {
	try {
		const studentsInfos = await DataBase.getAllStudents().then((students) =>
			students.map(({ vkId, role, class: _class }) => ({ vkId, role, class: _class })),
		);
		for (const { role, vkId, class: StudentsClass } of studentsInfos) {
			const res = await botInstance.execute('messages.getHistory', {
				count: 1,
				user_id: vkId,
				extended: 1,
			});

			if (res && res.items[0] && !isStudentOnDefaultScene(res)) {
				setTimeout(
					async () =>
						botInstance.sendMessage(
							[vkId],
							botCommands.botWasRebooted,
							null,
							await createDefaultKeyboard({ role, class: StudentsClass }),
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
					} = getNotifiableIdsWithHomeworkForEach(
						studentsOnDayOffset,
						dayHomework,
						dayOffset,
					);
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
						const commonHomework = dayHomework.filter((hw) => hw.onlyFor.length === 0);
						const parsedHomework = mapHomeworkByLesson(commonHomework);
						if (commonHomework.length > 0 && studentsWithoutPreferences.length > 0) {
							sendHomework(parsedHomework, botInstance, studentsWithoutPreferences);

							setTimeout(() => {
								let message = `Задание на ${getTomorrowOrAfterTomorrowOrDateString(
									dateWithOffset,
								)}\n`;
								botInstance.sendMessage(studentsWithoutPreferences, message);
							}, (dayHomework.length + 1) * 50);
						}
					}, (delayAfterStudentWithPreferences + 1) * 50);
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
 * @param {number} dayOffset
 */
function getNotifiableIdsWithHomeworkForEach(students, homework, dayOffset) {
	/**
	 * @type {{[key: number]: import("bot-database/build/types").IHomework[]}} homeworkForEachStudent
	 */
	const homeworkForEachStudent = {};
	const studentsWithoutPreferences = [];

	for (const {
		lastHomeworkCheck,
		vkId,
		settings: { notificationsEnabled, notificationTime, daysForNotification },
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
				let studentNotificationTime;
				let studentNotificationsEnabled;
				let studentDaysForNotification;

				if (hw.userPreferences[vkId] !== undefined) {
					studentNotificationTime =
						hw.userPreferences[vkId].notificationTime ?? notificationTime;
					studentNotificationsEnabled =
						hw.userPreferences[vkId].notificationEnabled ?? notificationsEnabled;
					studentDaysForNotification =
						hw.userPreferences[vkId].daysForNotification ?? daysForNotification;
				}

				if (hw.onlyFor.length === 0 || hw.onlyFor.includes(vkId)) {
					if (
						studentNotificationsEnabled &&
						studentDaysForNotification.includes(dayOffset)
					) {
						const [_, hours, mins] = studentNotificationTime
							.match(/([0-9]+):([0-9]+)/)
							.map(Number);

						return isReadyToNotificate(hours, mins, lastHomeworkCheck);
					}
				}

				return false;
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
 * @param {Map<string, import("bot-database/build/types").IHomework[]>} parsedHomework
 * @param {any} botInstance
 * @param {number[]} notifiableIds
 */
function sendHomework(parsedHomework, botInstance, notifiableIds) {
	if (notifiableIds.length > 0) {
		let index = 1;

		for (const [lesson, homework] of parsedHomework) {
			//Отфильтровать дз с onlyFor и отдельно оповещать тех, у кого есть такое дз

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

module.exports = {
	notifyAboutReboot,
	isStudentOnDefaultScene,
	notifyStudents,
	sendHomeworkToClassStudents,
	getTomorrowOrAfterTomorrowOrDateString,
	getNotifiableIdsWithHomeworkForEach,
	isReadyToNotificate,
	sendHomework,
	dayOffsetsToAddAccordingToPreferences,
	getHomeworkPayload,
};
