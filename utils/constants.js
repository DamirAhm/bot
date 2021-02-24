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

const buttonColors = {
	default: 'secondary',
	positive: 'positive',
	negative: 'negative',
	primary: 'primary',
	secondary: 'secondary',
};

const sceneNames = {
	addAnnouncement: 'addAnnouncement',
	addClass: 'addClass',
	addHomework: 'addHomework',
	addRedactor: 'addRedactor',
	adminPanel: 'adminPanel',
	changeSchedule: 'changeSchedule',
	checkAnnouncements: 'checkAnnouncements',
	checkHomework: 'checkHomework',
	checkSchedule: 'checkSchedule',
	classList: 'classList',
	contributorPanel: 'contributorPanel',
	default: 'default',
	enterDaysIndexes: 'enterDaysIndexes',
	error: 'error',
	giveFeedback: 'giveFeedback',
	pickClass: 'pickClass',
	pickSchool: 'pickSchool',
	redactorsList: 'redactorsList',
	register: 'register',
	removeRedactor: 'removeRedactor',
	settings: 'settings',
	start: 'start',
};

module.exports = {
	buttonColors,
	contentPropertyNames,
	monthsRP,
	sceneNames,
};
