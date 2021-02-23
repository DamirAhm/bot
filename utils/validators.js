//@ts-check

const { inRange } = require('./functions');

const maxDatesPerMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

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

module.exports = {
	isValidClassName,
	isValidCityName,
	isValidSchoolNumber,
	validateDate,
};
