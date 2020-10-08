const path = require('path');
const { Lessons, Roles } = require('bot-database/Models/utils');
const config = require('../config.js');
const Markup = require('node-vk-bot-api/lib/markup');
const { DataBase: DB, VK_API } = require('bot-database');
const botCommands = require('./botCommands');
const { capitalize, translit, retranslit } = require('./functions.js');
const { download } = require('./savePhoto');
const fs = require('fs');

const DataBase = new DB(config['MONGODB_URI']);
const VK = new VK_API(config['VK_API_KEY'], config['GROUP_ID'], config['ALBUM_ID']);

const contentPropertyNames = {
	to: 'Дата',
	text: 'Текст',
	lesson: 'Урок',
	createdBy: 'Создал',
};
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
	{
		label: botCommands.contributorPanel,
		payload: 'contributorPanel',
		color: 'primary',
		roles: [Roles.contributor, Roles.admin],
	},
	{
		label: botCommands.adminPanel,
		payload: 'adminPanel',
		color: 'positive',
		role: [Roles.admin],
	},
];

const contributorOptions = [
	{ label: botCommands.addHomework, payload: 'addHomework', color: 'default' },
	{ label: botCommands.addAnnouncement, payload: 'addAnnouncement', color: 'default' },
	{ label: botCommands.changeSchedule, payload: 'changeSchedule', color: 'default' },
	{ label: botCommands.addRedactor, payload: 'addRedactor', color: 'default' },
];
const adminOptions = [
	{ label: botCommands.removeRedactor, payload: 'removeRedactor', color: 'default' },
	{ label: botCommands.redactorsList, payload: 'redactorsList', color: 'default' },
	{ label: botCommands.addClass, payload: 'addClass', color: 'default' },
	{ label: botCommands.classList, payload: 'classList', color: 'default' },
];

const mapListToMessage = (list, startIndex = 1) => {
	return list.map((e, i) => `${i + startIndex}. ${e}`).join('\n');
};
const formMessage = (...messageSections) => {
	return messageSections.join('\n');
};

const renderAdminMenu = () => {
	return formMessage(
		'Админское меню\n',
		...adminOptions.map(({ label }, i) => `${i + 1}. ${label}`),
		'0: Назад',
	);
};
const renderAdminMenuKeyboard = () => {
	const buttons = adminOptions.reduce((acc, c) => {
		const button = Markup.button(c.label, 'primary');
		if (acc.length === 0 || acc[acc.length - 1].length >= 2) {
			acc.push([button]);
		} else if (acc[acc.length - 1].length < 2) {
			acc[acc.length - 1].push(button);
		}

		return acc;
	}, []);

	buttons.push([Markup.button('Назад', 'negative', { button: 'back' })]);

	return Markup.keyboard(buttons, { columns: 3 });
};

const renderContributorMenu = () => {
	return formMessage(
		'Меню редактора\n',
		...contributorOptions.map(({ label }, i) => `${i + 1}. ${label}`),
		'0: Назад',
	);
};
const renderContributorMenuKeyboard = () => {
	try {
		const buttons = contributorOptions.map((opt, i) => [
			Markup.button(opt.label, 'default', { button: opt.payload }),
		]);

		buttons.push([Markup.button('Назад', 'negative', { button: 'back' })]);

		return Markup.keyboard(buttons, { columns: 3 });
	} catch (e) {
		console.error(e);
		return null;
	}
};

const filenameRegExp = /.*\/(.*(\.jpg|\.png|\.gif|\.webp|\.jpeg|\.avif))$/;
const getFileName = (href) => href.match(filenameRegExp)?.[1];
const findMaxResolution = (photo) => {
	const maxRes = Math.max(
		...Object.keys(photo)
			.filter((key) => key.startsWith('photo'))
			.map((key) => key.match(/^photo_(\d*)/)[1])
			.map(Number),
	);

	return photo['photo_' + maxRes];
};

const parseAttachmentsToVKString = async (attachments) => {
	try {
		if (
			Array.isArray(attachments) &&
			attachments.every((att) => att.type && att[att.type] && att.type === 'photo')
		) {
			const parsedAttachments = [];

			for (const att of attachments) {
				const maxResHref = findMaxResolution(att.photo);
				const filename = path.join(__dirname, '../', 'uploads', getFileName(maxResHref));
				await download(maxResHref, filename);

				const photo = await VK.uploadPhotoToAlbum(fs.createReadStream(filename)).then(
					(photos) => photos[0],
				);

				parsedAttachments.push(`photo${photo.owner_id}_${photo.id}`);
			}

			return parsedAttachments;
		} else if (attachments.type && attachments[attachments.type]) {
			const maxResHref = findMaxResolution(attachments.photo);
			const filename = path.join(__dirname, '../', 'uploads', getFileName(maxResHref));

			await download(maxResHref, filename);

			const photo = await VK.uploadPhotoToAlbum(fs.createReadStream(filename)).then(
				(photos) => photos[0],
			);

			return `photo${photo.owner_id}_${photo.id}`;
		} else {
			throw new TypeError('Wrong attachments type');
		}
	} catch (e) {
		console.error('Cant load file');
	}
};

const createDefaultMenu = async (user_id) => {
	const role = await DataBase.getRole(user_id);

	const trueOptions = userOptions.filter(({ roles }) => !roles || roles.includes(role));

	return formMessage('Меню:', ...trueOptions.map(({ label }, i) => `${i + 1}. ${label}`));
};
const createDefaultKeyboard = async (role, ctx) => {
	try {
		if (!role) {
			role = await DataBase.getRole(ctx.message.user_id);
		}

		const trueOptions = userOptions.filter(({ roles }) => !roles || roles.includes(role));

		let buttons = trueOptions.map(({ label, payload, color }) =>
			Markup.button(label, color, { button: payload }),
		);

		return Markup.keyboard(buttons, { columns: buttons.length > 2 ? 2 : 1 });
	} catch (e) {
		console.error(e);
	}
};
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

const createBackKeyboard = (existingButtons = [], columns = 4) => {
	try {
		if (existingButtons[0] instanceof Array) {
			existingButtons.push([Markup.button(botCommands.back, 'negative', { button: 'back' })]);
		} else {
			existingButtons.push(Markup.button(botCommands.back, 'negative', { button: 'back' }));
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
			Markup.button(botCommands.no, 'negative'),
			Markup.button(botCommands.yes, 'positive'),
		]);
	} else {
		existingButtons.unshift(
			Markup.button(botCommands.no, 'negative'),
			Markup.button(botCommands.yes, 'positive'),
		);
	}

	return Markup.keyboard(existingButtons, { columns });
};

const parseDateToStr = (Date) => `${Date.getDate()} ${monthsRP[Date.getMonth()]}`;

const createContentDiscription = ({ to, lesson, text }, creatorFullName) => {
	return `${creatorFullName ? creatorFullName : ''}
        ${lesson ? `${contentPropertyNames.lesson}: ${lesson}\n` : ''}
        ${contentPropertyNames.text}: ${text}\n
        ${to ? `${contentPropertyNames.to}: ${parseDateToStr(to)}\n` : ''}`;
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
        ${botCommands.notificationsEnabled}: ${botCommands[notificationsEnabled]}
        ${notificationsEnabled ? `${botCommands.notificationTime}: ${notificationTime}` : ''}
		${botCommands.daysForNotification}: ${daysForNotification.join(', ')} ${getDayWord(
		daysForNotification[daysForNotification.length - 1],
	)}
    `;
};
function getDayWord(dayIndexFrom0To9) {
	if (dayIndexFrom0To9 === 0) return 'дней';
	else if (dayIndexFrom0To9 === 1) return 'день';

	return dayIndexFrom0To9 > 4 ? 'дней' : 'дня';
}

const notifyAllInClass = async (
	{ bot: botInstance, message: { user_id } },
	className,
	...messagePayload
) => {
	const { name: schoolName } = await DataBase.getSchoolForStudent(user_id);
	const Class = await DataBase.getClassByName(className, schoolName);

	if (Class) {
		const { students } = await Class.populate('students').execPopulate();

		setTimeout(() => {
			botInstance.sendMessage(
				students.filter(({ vkId }) => vkId !== user_id).map(({ vkId }) => vkId),
				...messagePayload,
			);
		}, 50);
	}
};

const lessonsList = mapListToMessage(Lessons, 0);

module.exports = {
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
	lessonsList,
	createContentDiscription,
	parseDateToStr,
	createConfirmKeyboard,
	createUserInfo,
	monthsRP,
	userOptions,
	contributorOptions,
	adminOptions,
};
