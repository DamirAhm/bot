//@ts-check

const { DataBase: DB } = require('bot-database');
const { sceneNames } = require('./constants');
const { createBackKeyboard, createDefaultKeyboard } = require('../utils/messagePayloading');

const changables = {
	class: 'class',
	notificationTime: 'notificationTime',
	notificationsEnabled: 'notificationsEnabled',
	daysForNotification: 'daysForNotification',
	school: 'school',
	city: 'city',
};

const DataBase = new DB(process.env.MONGODB_URI);

function changeSchoolAction(ctx) {
	if (ctx.session) {
		ctx.session.nextScene = sceneNames.settings;
		ctx.session.step = 3;
		ctx.session.pickFor = 'Выберите школу \n';
		ctx.session.backScene = sceneNames.contributorPanel;
		ctx.session.backStep = 1;
		ctx.session.changed = changables.school;
		ctx.scene.enter(sceneNames.pickSchool);
	} else {
		console.log('Theres is no session in context');
		ctx.scene.enter(sceneNames.error);
	}
}
function changeClassAction(ctx) {
	if (ctx.session) {
		ctx.session.nextScene = sceneNames.settings;
		ctx.session.step = 3;
		ctx.session.pickFor = 'Выберите класс \n';
		ctx.session.backScene = sceneNames.contributorPanel;
		ctx.session.backStep = 1;
		ctx.session.changed = changables.class;
		ctx.scene.enter(sceneNames.pickClass);
	} else {
		console.log('Theres is no session in context');
		ctx.scene.enter(sceneNames.error);
	}
}
function pickSchoolAndClassAction(
	ctx,
	{ nextScene = 'default', step = 0, prevScene = 'default', prevStep = 0 } = {},
) {
	if (ctx.session) {
		ctx.session.nextScene = nextScene;
		ctx.session.step = step;
		ctx.session.prevScene = prevScene;
		ctx.session.prevStep = prevStep;
		ctx.session.needToUpdateStudent = true;
		ctx.scene.enter(sceneNames.pickSchool);
	} else {
		console.log('Theres is no session in context');
		ctx.scene.enter(sceneNames.error);
	}
}

function enterDayIndexesAction(ctx) {
	if (ctx.session) {
		ctx.session.nextScene = sceneNames.settings;
		ctx.session.step = 3;
		ctx.session.backScene = sceneNames.contributorPanel;
		ctx.session.backStep = 1;
		ctx.session.changed = changables.daysForNotification;
		ctx.scene.enter(sceneNames.enterDaysIndexes);
	} else {
		console.log('Theres is no session in context');
		ctx.scene.enter(sceneNames.error);
	}
}

function changeNotificationTimeAction(ctx) {
	ctx.scene.next();
	ctx.session.changed = changables.notificationTime;
	ctx.reply(
		'Когда вы хотите получать уведомления? (в формате ЧЧ:ММ)',
		null,
		createBackKeyboard(),
	);
}

async function enableNotificationsAction(ctx) {
	let { Student } = ctx.session;

	if (!Student) {
		Student = await DataBase.getStudentByVkId(ctx.message.user_id);
	}

	Student.settings.notificationsEnabled = true;
	Student.save();

	ctx.scene.enter(sceneNames.default);
	ctx.reply('Уведомления включены', null, await createDefaultKeyboard(undefined, ctx));
}

async function disableNotificationsAction(ctx) {
	let { Student } = ctx.session;

	if (!Student) {
		Student = await DataBase.getStudentByVkId(ctx.message.user_id);
	}

	Student.settings.notificationsEnabled = false;
	Student.save();

	ctx.scene.enter(sceneNames.default);
	ctx.reply('Уведомления отключены', null, await createDefaultKeyboard(undefined, ctx));
}

module.exports = {
	changeSchoolAction,
	changeClassAction,
	enterDayIndexesAction,
	changeNotificationTimeAction,
	enableNotificationsAction,
	disableNotificationsAction,
	pickSchoolAndClassAction,
};
