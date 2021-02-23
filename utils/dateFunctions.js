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

module.exports = {
	getDateWeekBefore,
	getDateWithOffset,
	getTomorrowDate,
	isOneDay,
	isToday,
	getDayMonthString,
	parseDate,
	parseTime,
};
