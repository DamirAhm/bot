function changeSchoolAction(ctx) {
	if (ctx.session) {
		ctx.session.nextScene = 'settings';
		ctx.session.step = 3;
		ctx.session.pickFor = 'Выберите школу \n';
		ctx.session.backScene = 'contributorPanel';
		ctx.session.backStep = 1;
		ctx.session.changed = changables.school;
		ctx.scene.enter('pickSchool');
	} else {
		console.log('Theres is no session in context');
		ctx.scene.enter('error');
	}
}
function changeClassAction(ctx) {
	if (ctx.session) {
		ctx.session.nextScene = 'settings';
		ctx.session.step = 3;
		ctx.session.pickFor = 'Выберите класс \n';
		ctx.session.backScene = 'contributorPanel';
		ctx.session.backStep = 1;
		ctx.session.changed = changables.class;
		ctx.scene.enter('pickClass');
	} else {
		console.log('Theres is no session in context');
		ctx.scene.enter('error');
	}
}

function enterDayIndexesAction(ctx) {
	if (ctx.session) {
		ctx.session.nextScene = 'settings';
		ctx.session.step = 3;
		ctx.session.backScene = 'contributorPanel';
		ctx.session.backStep = 1;
		ctx.session.changed = changables.daysForNotification;
		ctx.scene.enter('enterDaysIndexes');
	} else {
		console.log('Theres is no session in context');
		ctx.scene.enter('error');
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

	ctx.scene.enter('default');
	ctx.reply('Уведомления включены', null, await createDefaultKeyboard(undefined, ctx));
}

async function disableNotificationsAction(ctx) {
	let { Student } = ctx.session;

	if (!Student) {
		Student = await DataBase.getStudentByVkId(ctx.message.user_id);
	}

	Student.settings.notificationsEnabled = false;
	Student.save();

	ctx.scene.enter('default');
	ctx.reply('Уведомления отключены', null, await createDefaultKeyboard(undefined, ctx));
}

module.exports = {
	changeSchoolAction,
	changeClassAction,
	enterDayIndexesAction,
	changeNotificationTimeAction,
	enableNotificationsAction,
	disableNotificationsAction,
};
