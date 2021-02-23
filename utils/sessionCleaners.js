//@ts-check

const sceneInfoInSession = ['nextScene', 'pickFor', 'backScene', 'step', 'backStep'];
const userDataInSession = ['role', 'userId', 'fullName', 'firstScene', 'secondScene'];
const dataForSceneInSession = [
	'Class',
	'Student',
	'newHomework',
	'newAnnouncement',
	'isFullFill',
	'schedule',
	'changingDay',
	'classes',
	'enteredDayIndexes',
	'changed',
	'possibleLessons',
	'homework',
	'students',
	'cityNames',
	'cityName',
	'changedCity',
];

/**
 * @param {any} ctx
 */
function cleanSession(ctx) {
	cleanDataForSceneFromSession(ctx);
	cleanSceneInfoFromSession(ctx);
}
/**
 * @param {{ [x: string]: any; }} ctx
 */
function cleanSceneInfoFromSession(ctx) {
	for (const pole of sceneInfoInSession) {
		delete ctx[pole];
	}
}
/**
 * @param {{ [x: string]: any; }} ctx
 */
function cleanDataForSceneFromSession(ctx) {
	for (const pole of dataForSceneInSession) {
		ctx[pole] = undefined;
	}
}
/**
 * @param {{ [x: string]: any; }} ctx
 */
function cleanUserInfoFromSession(ctx) {
	for (const pole of userDataInSession) {
		ctx[pole] = undefined;
	}
}

module.exports = {
	cleanSession,
	cleanSceneInfoFromSession,
	cleanDataForSceneFromSession,
	cleanUserInfoFromSession,
};
