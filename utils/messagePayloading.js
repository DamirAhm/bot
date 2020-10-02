const { Lessons, Roles } = require('bot-database/Models/utils');
const config = require('../config.js');
const Markup = require('node-vk-bot-api/lib/markup');
const { DataBase: DB } = require('bot-database/DataBase');
const botCommands = require('./botCommands');
const { capitalize, translit, retranslit } = require('./functions.js');

const DataBase = new DB(config['MONGODB_URI']);

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
];

const contributorOptions = [
	{ label: botCommands.addHomework, payload: botCommands.addHomework, color: 'default' },
	{ label: botCommands.addAnnouncement, payload: botCommands.addAnnouncement, color: 'default' },
	{ label: botCommands.changeSchedule, payload: botCommands.changeSchedule, color: 'default' },
	{ label: botCommands.addRedactor, payload: botCommands.addRedactor, color: 'default' },
];
const adminOptions = [
	{ label: botCommands.removeRedactor, payload: botCommands.removeRedactor, color: 'default' },
	{ label: botCommands.redactorsList, payload: botCommands.redactorsList, color: 'default' },
	{ label: botCommands.addClass, payload: botCommands.addClass, color: 'default' },
	{ label: botCommands.classList, payload: botCommands.classList, color: 'default' },
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
		const button = Markup.button(c.payload, 'primary');
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
			Markup.button(opt.payload, 'default', { button: opt.payload }),
		]);

		buttons.push([Markup.button('Назад', 'negative', { button: 'back' })]);

		return Markup.keyboard(buttons, { columns: 3 });
	} catch (e) {
		console.error(e);
		return null;
	}
};

const parseAttachmentsToVKString = (attachments) => {
	if (Array.isArray(attachments) && attachments.every((att) => att.type && att[att.type])) {
		return attachments.map(
			(att) =>
				`${att.type}${att[att.type].owner_id}_${att[att.type].id}${
					att[att.type].access_key ? '_' + att[att.type].access_key : ''
				}`,
		);
	} else if (attachments.type && attachments[attachments.type]) {
		return `${attachments.type}${attachments[attachments.type].owner_id}_${
			attachments[attachments.type].id
		}${
			attachments[attachments.type].access_key
				? '_' + attachments[attachments.type].access_key
				: ''
		}`;
	} else {
		throw new TypeError('Wrong attachments type');
	}
};

const createDefaultMenu = () => {
	return formMessage('Меню:', ...userOptions.map(({ label }, i) => `${i + 1}. ${label}`));
};
const createDefaultKeyboard = async (role, ctx) => {
	try {
		let buttons = userOptions.map(({ label, payload, color }) =>
			Markup.button(label, color, { button: payload }),
		);

		if (!role) {
			role = await DataBase.getRole(ctx.message.user_id);
		}

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
	const Class = await DataBase.getClassByName(className);

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
};
