//@ts-check
const path = require("path");
const { Lessons, Roles } = require("bot-database/build/Models/utils");
const config = require("../config.js");
const Markup = require("node-vk-bot-api/lib/markup");
const { DataBase: DB } = require("bot-database");
const VK_API = require("bot-database/build/VkAPI/VK_API").default;
const botCommands = require("./botCommands");
const { capitalize, retranslit } = require("./translits.js");
const download = require("./saveFile");
const fs = require("fs");
const {
	monthsRP,
	contentPropertyNames,
	buttonColors,
	sceneNames,
} = require("./constants.js");
const { Types } = require("mongoose");

const DataBase = new DB(process.env.MONGODB_URI);
const VK = new VK_API(
	process.env.VK_API_KEY,
	+config["GROUP_ID"],
	+config["ALBUM_ID"]
);

const userOptions = [
	{
		label: botCommands.checkHomework,
		payload: sceneNames.checkHomework,
		color: buttonColors.primary,
		needClass: true,
		withoutClass: false,
	},
	{
		label: botCommands.checkAnnouncements,
		payload: sceneNames.checkAnnouncements,
		color: buttonColors.primary,
		needClass: true,
		withoutClass: false,
	},
	{
		label: botCommands.addHomework,
		payload: sceneNames.addHomework,
		color: buttonColors.primary,
		roles: [Roles.student],
		needClass: true,
		withoutClass: false,
	},
	{
		label: botCommands.addAnnouncement,
		payload: sceneNames.addAnnouncement,
		roles: [Roles.student],
		color: buttonColors.primary,
		needClass: true,
		withoutClass: false,
	},
	{
		label: botCommands.checkSchedule,
		payload: sceneNames.checkSchedule,
		color: buttonColors.primary,
		needClass: true,
		withoutClass: false,
	},
	{
		label: botCommands.settings,
		payload: sceneNames.settings,
		color: buttonColors.primary,
		needClass: false,
		withoutClass: false,
	},
	{
		label: botCommands.calls,
		payload: sceneNames.calls,
		color: buttonColors.primary,
		needClass: true,
		withoutClass: false,
	},
	{
		label: botCommands.giveFeedback,
		payload: sceneNames.giveFeedback,
		color: buttonColors.default,
		needClass: false,
		withoutClass: false,
	},
	{
		label: botCommands.contributorPanel,
		payload: sceneNames.contributorPanel,
		color: buttonColors.negative,
		roles: [Roles.contributor, Roles.admin],
		needClass: true,
		withoutClass: false,
	},
	{
		label: botCommands.adminPanel,
		payload: sceneNames.adminPanel,
		color: buttonColors.positive,
		roles: [Roles.admin],
		needClass: false,
		withoutClass: false,
	},
	{
		label: botCommands.pickSchoolAndClass,
		payload: sceneNames.pickSchool,
		color: buttonColors.default,
		needClass: false,
		withoutClass: true,
	},
];

const contributorOptions = [
	{
		label: botCommands.addHomework,
		payload: sceneNames.addHomework,
		color: buttonColors.default,
	},
	{
		label: botCommands.addAnnouncement,
		payload: sceneNames.addAnnouncement,
		color: buttonColors.default,
	},
	{
		label: botCommands.changeSchedule,
		payload: sceneNames.changeSchedule,
		color: buttonColors.default,
	},
	{
		label: botCommands.addRedactor,
		payload: sceneNames.addRedactor,
		color: buttonColors.default,
	},
];
const adminOptions = [
	{
		label: botCommands.removeRedactor,
		payload: sceneNames.removeRedactor,
		color: buttonColors.default,
	},
	{
		label: botCommands.redactorsList,
		payload: sceneNames.redactorsList,
		color: buttonColors.default,
	},
	{
		label: botCommands.addClass,
		payload: sceneNames.addClass,
		color: buttonColors.default,
	},
	{
		label: botCommands.classList,
		payload: sceneNames.classList,
		color: buttonColors.default,
	},
];

const mapListToMessage = (list, startIndex = 1) => {
	return list.map((e, i) => `${i + startIndex}. ${e}`).join("\n");
};
const formMessage = (...messageSections) => {
	return messageSections.join("\n");
};

const renderAdminMenu = () => {
	return formMessage(
		"Админское меню\n",
		...adminOptions.map(({ label }, i) => `${i + 1}. ${label}`),
		"0: Назад"
	);
};
const renderAdminMenuKeyboard = () => {
	const buttons = adminOptions.reduce((acc, c) => {
		const button = Markup.button(c.label, buttonColors.primary);
		if (acc.length === 0 || acc[acc.length - 1].length >= 2) {
			acc.push([button]);
		} else if (acc[acc.length - 1].length < 2) {
			acc[acc.length - 1].push(button);
		}

		return acc;
	}, []);

	buttons.push([
		Markup.button("Назад", buttonColors.negative, { button: "back" }),
	]);

	return Markup.keyboard(buttons, { columns: 3 });
};

const renderContributorMenu = () => {
	return formMessage(
		"Меню редактора\n",
		...contributorOptions.map(({ label }, i) => `${i + 1}. ${label}`),
		"0: Назад"
	);
};
const renderContributorMenuKeyboard = () => {
	try {
		const buttons = contributorOptions.map((opt, i) => [
			Markup.button(opt.label, buttonColors.default, { button: opt.payload }),
		]);

		buttons.push([
			Markup.button("Назад", buttonColors.negative, { button: "back" }),
		]);

		return Markup.keyboard(buttons, { columns: 3 });
	} catch (e) {
		console.error(e);
		return null;
	}
};

const filenameRegExp = /.*\/(.*(\.jpg|\.png|\.gif|\.webp|\.jpeg|\.avif))/;
const getFileName = (href) => href.match(filenameRegExp)?.[1];
const findMaxResolution = (photo) => {
	const maxRes = Math.max(
		...Object.keys(photo)
			.filter((key) => key.startsWith("photo"))
			.map((key) => key.match(/^photo_(\d*)/)[1])
			.map(Number)
	);

	return photo["photo_" + maxRes];
};

const parseAttachmentsToVKString = async (attachments) => {
	try {
		if (
			Array.isArray(attachments) &&
			attachments.every(
				(att) => att.type && att[att.type] && att.type === "photo"
			)
		) {
			const parsedAttachments = [];

			for (const att of attachments) {
				const maxResHref = findMaxResolution(att.photo);
				const filename = path.join(
					__dirname,
					"../",
					"uploads",
					getFileName(maxResHref)
				);
				await download(maxResHref, filename);

				const photo = await VK.uploadPhotoToAlbum(
					fs.createReadStream(filename)
				).then((photos) => photos[0]);

				parsedAttachments.push(`photo${photo.owner_id}_${photo.id}`);
			}

			return parsedAttachments;
		} else if (attachments.type && attachments[attachments.type]) {
			const maxResHref = findMaxResolution(attachments.photo);

			const filename = getFileName(maxResHref);
			const pathname = path.join(__dirname, "../", "uploads", filename);

			await download(maxResHref, pathname);

			const photo = await VK.uploadPhotoToAlbum(
				fs.createReadStream(pathname)
			).then((photos) => photos[0]);

			return `photo${photo.owner_id}_${photo.id}`;
		} else {
			throw new TypeError("Wrong attachments type");
		}
	} catch (e) {
		console.error(e);
		console.error("Cant load file");
	}
};

const createDefaultMenu = async (user_id) => {
	const Student = await DataBase.getStudentByVkId(user_id);

	if (Student) {
		const { role, class: StudentsClass } = Student;
		const usableOptions = userOptions.filter(
			({ roles, needClass, withoutClass }) =>
				(!roles || roles.includes(role)) &&
				(!needClass || StudentsClass) &&
				(!withoutClass || StudentsClass === null)
		);

		if (StudentsClass === null) {
		}

		return formMessage(
			"Меню:",
			...usableOptions.map(({ label }, i) => `${i + 1}. ${label}`)
		);
	} else {
		throw new Error("Can`t find user");
	}
};

/**
 * @param {{role: Roles, class: Types.ObjectId | null}?} studentInfo
 * @param {any?} ctx
 */
const createDefaultKeyboard = async (studentInfo, ctx) => {
	try {
		let role, StudentsClass;

		if (
			!studentInfo ||
			studentInfo.role === undefined ||
			studentInfo.class === undefined
		) {
			const Student = await DataBase.getStudentByVkId(ctx.message.user_id);

			if (Student) {
				role = Student.role;
				StudentsClass = Student.class;
			} else {
				throw new Error("Can`t find user");
			}
		} else {
			role = studentInfo.role;
			StudentsClass = studentInfo.class;
		}

		return createDefaultKeyboardSync(role, StudentsClass);
	} catch (e) {
		console.error(e);
	}
};
/**
 *
 * @param {Roles} role
 * @param {Types.ObjectId | null} StudentsClass
 */
const createDefaultKeyboardSync = (role, StudentsClass) => {
	const trueOptions = getUsableOptionsList(role, StudentsClass);

	let buttons = trueOptions.map(({ label, payload, color }) =>
		Markup.button(label, color, { button: payload })
	);

	return Markup.keyboard(buttons, { columns: buttons.length > 2 ? 2 : 1 });
};
/**
 *
 * @param {Roles} role
 * @param {Types.ObjectId | null} StudentsClass
 */
const getUsableOptionsList = (role, StudentsClass) => {
	return userOptions.filter(
		({ roles, needClass, withoutClass }) =>
			(!roles || roles.includes(role)) &&
			(!needClass || StudentsClass) &&
			(!withoutClass || StudentsClass === null)
	);
};

const createBackKeyboard = (existingButtons = [], columns = 4) => {
	try {
		if (existingButtons[0] instanceof Array) {
			existingButtons.push([
				Markup.button(botCommands.back, buttonColors.negative, {
					button: "back",
				}),
			]);
		} else {
			existingButtons.push(
				Markup.button(botCommands.back, buttonColors.negative, {
					button: "back",
				})
			);
		}

		return Markup.keyboard(existingButtons, { columns });
	} catch (e) {
		console.error(e);
		return null;
	}
};
const createConfirmKeyboard = (existingButtons = [], columns = 4) => {
	if (existingButtons[0] instanceof Array) {
		existingButtons.unshift([
			Markup.button(botCommands.no, buttonColors.negative),
			Markup.button(botCommands.yes, buttonColors.positive),
		]);
	} else {
		existingButtons.unshift(
			Markup.button(botCommands.no, buttonColors.negative),
			Markup.button(botCommands.yes, buttonColors.positive)
		);
	}

	return Markup.keyboard(existingButtons, { columns });
};

const parseDateToStr = (Date) =>
	`${Date.getDate()} ${monthsRP[Date.getMonth()]}`;

const createContentDiscription = ({ to, lesson, text }, creatorFullName) => {
	return `${creatorFullName ? creatorFullName : ""}
        ${lesson ? `${contentPropertyNames.lesson}: ${lesson}\n` : ""}
        ${contentPropertyNames.text}: ${text}\n
        ${to ? `${contentPropertyNames.to}: ${parseDateToStr(to)}\n` : ""}`;
};
const createUserInfo = ({
	role,
	settings: { notificationsEnabled, notificationTime, daysForNotification },
	className,
	name,
	cityName,
	schoolNumber,
}) => {
	return `${name}
	${botCommands.city}: ${capitalize(retranslit(cityName))}
	${botCommands.schoolNumber}: ${schoolNumber}
    ${botCommands.class}: ${className}
    ${botCommands.role}: ${botCommands[role.toLowerCase()]}
    ${botCommands.settings}:
        ${botCommands.notificationsEnabled}: ${
		botCommands[notificationsEnabled]
	}
        ${
					notificationsEnabled
						? `${botCommands.notificationTime}: ${notificationTime}`
						: ""
				}
		${botCommands.daysForNotification}: ${daysForNotification.join(
		", "
	)} ${getDayWord(daysForNotification[daysForNotification.length - 1])}
    `;
};
function getDayWord(dayIndexFrom0To9) {
	if (dayIndexFrom0To9 === 0) return "дней";
	else if (dayIndexFrom0To9 === 1) return "день";

	return dayIndexFrom0To9 > 4 ? "дней" : "дня";
}

const notifyAllInClass = async (
	{ bot: botInstance, message: { user_id } },
	className,
	...messagePayload
) => {
	const { name: schoolName } = await DataBase.getSchoolForStudent(user_id);
	const Class = await DataBase.getClassByName(className, schoolName);

	if (Class) {
		const { students } = await DataBase.populate(Class);

		setTimeout(() => {
			botInstance.sendMessage(
				students.filter(({ vkId }) => vkId !== user_id).map(({ vkId }) => vkId),
				...messagePayload
			);
		}, 50);
	}
};

const nothingLesson = Lessons[0];
const getLessonsList = (additionalLessons = []) => {
	const lessonsList = [...new Set([...Lessons, ...additionalLessons])]
		.sort()
		.filter((les) => les != nothingLesson);
	lessonsList.unshift(nothingLesson);

	return lessonsList;
};
const getLessonsListMessage = (additionalLessons) =>
	mapListToMessage(getLessonsList(additionalLessons), 0);

module.exports = {
	getLessonsList,
	createDefaultKeyboardSync,
	formMessage,
	renderAdminMenu,
	parseAttachmentsToVKString,
	notifyAllInClass,
	createDefaultKeyboard,
	renderAdminMenuKeyboard,
	createBackKeyboard,
	createDefaultMenu,
	renderContributorMenuKeyboard,
	renderContributorMenu,
	mapListToMessage,
	getLessonsListMessage,
	createContentDiscription,
	parseDateToStr,
	createConfirmKeyboard,
	createUserInfo,
	getUsableOptionsList,
	monthsRP,
	userOptions,
	contributorOptions,
	adminOptions,
};
