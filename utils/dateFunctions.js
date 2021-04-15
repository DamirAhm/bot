//@ts-check
const { monthsRP } = require('./messagePayloading');

function getDateWeekBefore() {
	const date = new Date();

	return new Date(date.setDate(date.getDate() - 7));
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
 * @param {Date} date
 */
function getDayMonthString(date) {
	return `${date.getDate()} ${monthsRP[date.getMonth()]}`;
}

const dateRegExp = /^([0-9]{1,2})\.([0-9]{1,2})\.?([0-9]{2}|[0-9]{4})?$/;
/**
 * @param {string} body
 */
function parseDate(body) {
	const parsedDate = body
		.match(dateRegExp)
		.slice(1, 4)
		.map((n) => (isNaN(Number(n)) ? undefined : Number(n)));

	if (parsedDate?.[2] <= 99) {
		parsedDate[2] += 2000;
	}

	return parsedDate;
}
/**
 * @param {string} timeString
 */
function parseTime(timeString) {
	if (timeRegExp.test(timeString)) {
		return timeString
			.match(timeRegExp)
			.slice(1, 3)
			.map((e) => parseInt(e));
	} else {
		throw new Error('Time string does not match format 00:00, got: ' + timeString);
	}
}
const timeRegExp = /([0-9]{2}):([0-9]{2})/;

function isTomorrowSunday() {
	const curDayOfWeek = new Date().getDay();

	return curDayOfWeek === 6;
}
function isTodaySunday() {
	const curDayOfWeek = new Date().getDay();

	return curDayOfWeek === 0;
}

function getDiffBetweenTimesInMinutes(timeStringA, timeStringB) {
	const [hoursA, minutesA] = parseTime(timeStringA);
	const [hoursB, minutesB] = parseTime(timeStringB);

	let res = 0;

	if (timeStringA > timeStringB) {
		res += (hoursA - hoursB) * 60;
		res += minutesA - minutesB;
	} else {
		res += (hoursB - hoursA) * 60;
		res += minutesB - minutesA;
	}

	return res;
}

/**
 * @param {Date} date
 */
function getTimeFromDate(date) {
	const hours = String(date.getHours()).padStart(2, '0');
	const minutes = String(date.getMinutes()).padStart(2, '0');
	return `${hours}:${minutes}`;
}

module.exports = {
	getTimeFromDate,
	getDiffBetweenTimesInMinutes,
	isTomorrowSunday,
	isTodaySunday,
	getDateWeekBefore,
	getDateWithOffset,
	getTomorrowDate,
	isOneDay,
	isToday,
	getDayMonthString,
	parseDate,
	parseTime,
};
