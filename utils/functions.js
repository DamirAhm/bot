//@ts-check
const { DataBase: DB, VK_API, Roles } = require('bot-database');
const config = require('../config.js');
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
const { getDateWeekBefore } = require('./dateFunctions.js');
const { buttonColors } = require('./constants.js');

const mapListToKeyboard = (
	/** @type {any[]} */ list,
	{ trailingButtons = [], leadingButtons = [] } = {},
) => {
	const columnsAmount = calculateColumnsAmount(list.length);
	const classesByRows = list.reduce((acc, c, i) => {
		if (i % columnsAmount === 0) {
			acc.push([Markup.button(c)]);
		} else {
			acc[Math.floor(i / columnsAmount)].push(Markup.button(c));
		}

		return acc;
	}, []);

	if ([trailingButtons, leadingButtons].every((btns) => Array.isArray(btns[0]) || !btns.length)) {
		return Markup.keyboard([...leadingButtons, ...classesByRows, ...trailingButtons], {
			columns: calculateColumnsAmount(list.length),
		});
	} else {
		return Markup.keyboard([leadingButtons, ...classesByRows, trailingButtons], {
			columns: calculateColumnsAmount(list.length),
		});
	}
};

const DataBase = new DB(process.env.MONGODB_URI);
const vk = new VK_API(process.env.VK_API_KEY, +config['GROUP_ID'], +config['ALBUM_ID']);

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
 * @param {number} amountOfItems
 */
function calculateColumnsAmount(amountOfItems) {
	if (amountOfItems % 3 === 0) return 3;
	else if (amountOfItems % 2 === 0) return 2;
	else return 4;
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
		createBackKeyboard([[Markup.button(botCommands.changeSettings, buttonColors.primary)]]),
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
	parseSchoolName,
	findMaxPhotoResolution,
	inRange,
	filterContentByDate,
	calculateColumnsAmount,
	mapListToKeyboard,
	removeOldHomework,
	getCityNames,
	getSchoolNumbers,
	getSchoolName,
	sendStudentInfo,
	getPossibleLessonsAndSetInSession,
	mapStudentToPreview,
	getScheduleString,
	getDayScheduleString,
	getLengthOfHomeworkWeek,
	mapAttachmentsToObject,
	getTextsAndAttachmentsFromForwarded,
};
