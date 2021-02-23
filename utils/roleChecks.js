//@ts-check
const { DataBase: DB, Roles } = require('bot-database');

const DataBase = new DB(process.env.MONGODB_URI);

/**
 *
 * @param {import("bot-database/build/types").IStudent | {message: {user_id: number}}} ctxOrStudent
 * @return {Promise<boolean>}
 */
const isAdmin = async (ctxOrStudent) => {
	if ('role' in ctxOrStudent) {
		return [Roles.admin].includes(ctxOrStudent.role);
	} else {
		let role = await DataBase.getRole(ctxOrStudent.message.user_id);

		return role === Roles.admin;
	}
};

/**
 *
 * @param {import("bot-database/build/types").IStudent | {message: {user_id: number}}} ctxOrStudent
 * @return {Promise<boolean>}
 */
const isContributor = async (ctxOrStudent) => {
	if ('role' in ctxOrStudent) {
		return [Roles.admin, Roles.contributor].includes(ctxOrStudent.role);
	} else {
		let role = await DataBase.getRole(ctxOrStudent.message.user_id);

		return [Roles.admin, Roles.contributor].includes(role);
	}
};

module.exports = {
	isAdmin,
	isContributor,
};
