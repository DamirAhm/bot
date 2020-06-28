const
    Scene = require( 'node-vk-bot-api/lib/scene' ),
    config = require( 'config' ),
    {
        isAdmin,
        renderAdminMenu,
        renderAdminMenuKeyboard,
        renderAdminKeyboard,
        createDefaultMenu,
        createDefaultKeyboard,
        renderContributorMenu,
        renderContributorMenuKeyboard,
        lessonsList,
        parseAttachments,
        mapListToMessage,
        formMessage,
        createContentDiscription,
        createConfirmKeyboard,
        createUserInfo,
        createBackKeyboard,
    } = require( "./utils/messagePayloading.js" ),
    { DataBase: DB } = require( "./DataBase/DataBase.js" ),
    { findNextLessonDate, findNextDayWithLesson } = require( "./DataBase/utils/functions" ),
    botCommands = require( "./utils/botCommands.js" ),
    { Roles, isValidClassName, Lessons, daysOfWeek } = require( "./DataBase/Models/utils.js" ),
    VK_API = require( "./DataBase/VkAPI/VK_API.js" ),
    Markup = require( "node-vk-bot-api/lib/markup" ),
    c = require( "config" ),
    DataBase = new DB( config.get( "MONGODB_URI" ) ),
    vk = new VK_API( config.get( "VK_API_KEY" ), config.get( "GROUP_ID" ), config.get( "ALBUM_ID" ) );

const maxDatesPerMonth = [
    31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31
];

const findMaxPhotoResolution = ( photo ) => {
    let maxR = 0;
    let url = "";

    for ( let i in photo ) {
        if ( photo.hasOwnProperty( i ) && /photo_\d/.test( i ) ) {
            const [ _, res ] = i.match( /photo_(\d)/ );

            if ( +res > maxR ) {
                maxR = +res;
                url = photo[ i ];
            }
        }
    }

    return url;
}

module.exports.errorScene = new Scene( "error",
    async ( ctx ) => {
        ctx.reply( "Простите произошла ошибка", null, await createDefaultKeyboard( ctx.session.isAdmin, ctx.session.isContributor, ctx ) );
    }
)

module.exports.startScene = new Scene( "start",
    async ( ctx ) => {
        ctx.reply( `Привет ${ctx.session.firstName} ${ctx.session.secondName}`, null, await createDefaultKeyboard( ctx.session.isAdmin, ctx.session.isContributor, ctx ) );
        ctx.scene.enter( "default" );
    }
)

module.exports.registerScene = new Scene( "register",
    async ( ctx ) => {
        const { scene: { next, leave } } = ctx;
        const { userId } = ctx.session;

        let Student = await DataBase.getStudentByVkId( userId );

        if ( !Student ) {
            Student = await DataBase.createStudent( userId );
        }

        if ( Student.registered ) {
            leave();
            ctx.reply( "Вы уже зарегестрированны" )
        } else {
            next();
            ctx.reply( "Введите имя класса в котором вы учитесь" );
        }
    },
    async ( ctx ) => {
        const { message: { body }, scene: { leave, enter } } = ctx;
        const { userId } = ctx.session;

        const spacelessClassName = body.replace( /\s*/g, "" );
        if ( /\d+([a-z]|[а-я])/i.test( spacelessClassName ) ) {
            const Class = await DataBase.getClassByName( spacelessClassName );
            const Student = await DataBase.getStudentByVkId( userId );

            await Student.updateOne( { registered: true } );
            await Student.save();

            if ( Class ) {
                await DataBase.addStudentToClass( userId, spacelessClassName );
                leave();
                ctx.reply( "Вы успешно зарегестрированны", null, await createDefaultKeyboard( ctx.session.isAdmin, ctx.session.isContributor, ctx ) );
            } else {
                const Class = await DataBase.createClass( spacelessClassName );
                if ( Class ) {
                    await DataBase.addStudentToClass( userId, spacelessClassName );
                    leave();
                    ctx.reply( "Вы успешно зарегестрированны", null, null, await createDefaultKeyboard( ctx.session.isAdmin, ctx.session.isContributor, ctx ) );
                }
            }
        } else {
            enter( "register" );
            ctx.reply( "Неверное имя класса" );
        }
    }
)

module.exports.defaultScene = new Scene( "default",
    async ( ctx ) => {
        try {
            ctx.scene.next();
            if ( ctx.session.userId ) {
                ctx.reply( createDefaultMenu(), null, await createDefaultKeyboard( ctx.session.isAdmin, ctx.session.isContributor, ctx ) );
            } else {
                const student = await DataBase.getStudentByVkId( ctx.message.user_id );

                if ( student ) {
                    ctx.reply( createDefaultMenu(), null, await createDefaultKeyboard( student.role === Roles.admin, student.role === Roles.contributor ) );
                } else {
                    ctx.scene.enter( "start" );
                }
            }
        } catch ( e ) {
            ctx.scene.enter( "error" );
            console.error( e );
        }
    },
    async ( ctx ) => {
        try {
            switch ( ctx.message.body.trim() ) {
                case botCommands.adminPanel:
                    ctx.scene.enter( 'adminPanel' );
                    break;
                case botCommands.contributorPanel:
                    ctx.scene.enter( 'contributorPanel' );
                    break;
                case botCommands.checkHomework:
                    ctx.scene.enter( 'default' );
                    ctx.reply( "Дз не буит" )
                case botCommands.checkSchedule:
                    ctx.scene.enter( 'checkSchedule' );
                    break;
                case botCommands.settings:
                    ctx.scene.enter( 'settings' );
                    break;
                default:
                    ctx.reply( botCommands.notUnderstood );
            }
        } catch ( e ) {
            ctx.scene.enter( "error" );
            console.error( e );
        }
    }
)
module.exports.checkSchedule = new Scene( "checkSchedule",
    async ( ctx ) => {
        try {
            const needToPickClass = ctx.session.isAdmin ?? await DataBase.getRole( ctx.message.user_id ) === Roles.admin
            if ( needToPickClass && !ctx.session.Class ) {
                ctx.session.nextScene = "checkSchedule";
                ctx.session.step = 0;
                ctx.scene.enter( "pickClass" );
            } else {
                const Student = await DataBase.getStudentByVkId( ctx.session.userId || ctx.message.user_id );

                if ( Student ) {
                    if ( Student.registered ) {
                        let { Class } = ctx.session;
                        if ( !Class ) {
                            Class = await DataBase.getClassBy_Id( Student.class );
                        }

                        const message = await getScheduleString( Class );
                        ctx.session.Class = undefined;

                        if ( message.trim() === "" ) {
                            ctx.scene.enter( "default" );
                            ctx.reply( "Для данного класса пока что не существует расписания", null, await createDefaultKeyboard( ctx.session.isAdmin, ctx.session.isContributor, ctx ) );
                        }
                        else {
                            ctx.scene.enter( 'default' );
                            ctx.reply( message, null, await createDefaultKeyboard( ctx.session.isAdmin, ctx.session.isContributor, ctx ) );
                        }
                    } else {
                        ctx.scene.enter( 'register' );
                        ctx.reply( "Сначала вам необходимо зарегестрироваться, введите имя класса в котором вы учитесь" );
                    }
                } else {
                    console.log( "user are not existing", ctx.session.userId );
                    throw new Error();
                }
            }
        } catch ( e ) {
            console.error( e );
            ctx.scene.enter( "error" );
        }
    }
)
//TODO
module.exports.checkHomework = new Scene( "checkHomework",

)
module.exports.checkChanges = new Scene( "checkChanges",

)

module.exports.settings = new Scene( "settings",
    async ( ctx ) => {
        try {
            ctx.session.Student = undefined;

            const Student = await DataBase.getStudentByVkId( ctx.message.user_id );

            if ( Student ) {
                ctx.session.Student = Student;
                const { role, class: Class, settings } = Student;

                const { name: className } = await DataBase.getClassBy_Id( Class );

                const message = createUserInfo( { role, className, settings, name: Student.firstName + " " + Student.secondName } );

                ctx.scene.next();
                ctx.reply( message, null, createBackKeyboard( [ Markup.button( botCommands.changeSettings, "primary" ) ], 1 ) );
            } else {
                ctx.scene.enter( "start" );
            }
        } catch ( e ) {
            console.error( e );
            ctx.scene.enter( "error" );
        }
    },
    ( ctx ) => {
        try {
            const { message: { body } } = ctx;
            if ( body === botCommands.changeSettings || /изменить/i.test( body ) ) {
                ctx.scene.next();
                ctx.reply(
                    "Что вы хотите изменить?",
                    null,
                    createBackKeyboard( [
                        ctx.session.Student.settings.notificationsEnabled
                            ? [ Markup.button( botCommands.disableNotifications, "primary" ), Markup.button( botCommands.changeNotificationTime, "primary" ) ]
                            : [ Markup.button( botCommands.enbleNotifications, "primary" ) ],
                    ] ) );
            } else if ( body === botCommands.back ) {
                ctx.scene.enter( "default" );
            } else {
                ctx.reply( botCommands.notUnderstood );
            }
        } catch ( e ) {
            console.error( e );
            ctx.scene.enter( "error" )
        }
    },
    async ( ctx ) => {
        try {
            const { message: { body } } = ctx;

            if ( body === botCommands.disableNotifications ) {
                let { Student } = ctx.session;

                if ( !Student ) {
                    Student = await DataBase.getStudentByVkId( ctx.message.user_id );
                }

                Student.settings.notificationsEnabled = false;
                Student.save();

                ctx.scene.enter( "default" );
                ctx.reply( "Уведомления отключены", null, await createDefaultKeyboard( ctx.session.isAdmin, ctx.session.isContributor, ctx ) );
            } else if ( body === botCommands.enbleNotifications ) {
                let { Student } = ctx.session;

                if ( !Student ) {
                    Student = await DataBase.getStudentByVkId( ctx.message.user_id );
                }

                Student.settings.notificationsEnabled = true;
                Student.save();

                ctx.scene.enter( "default" );
                ctx.reply( "Уведомления включены", null, await createDefaultKeyboard( ctx.session.isAdmin, ctx.session.isContributor, ctx ) );
            } else if ( body === botCommands.changeNotificationTime ) {
                ctx.scene.next();
                ctx.reply( "Когда вы хотите получать уведомления? (в формате ЧЧ:ММ)", null, createBackKeyboard() );
            } else if ( body === botCommands.back ) {
                ctx.scene.enter( "default" );
            } else {
                ctx.reply( botCommands.notUnderstood )
            }
        } catch ( e ) {
            console.error( e );
            ctx.scene.enter( "error" );
        }
    },
    async ( ctx ) => {
        try {
            const { message: { body } } = ctx;

            if ( body === botCommands.back ) {
                ctx.scene.selectStep( 2 );
                ctx.reply(
                    "Что вы хотите изменить?",
                    null,
                    createBackKeyboard( [ [
                        Markup.button( botCommands.disableNotifications ),
                        Markup.button( botCommands.changeNotificationTime )
                    ] ] ) );
            } else if ( /[0-9]+:[0-9]+/.test( body ) ) {
                const [ hrs, mins ] = body.match( /([0-9]+):([0-9]+)/ ).slice( 1 ).map( Number );

                if ( hrs >= 0 && hrs < 24 && mins >= 0 && mins < 60 ) {
                    let { Student } = ctx.session;

                    if ( !Student ) {
                        Student = await DataBase.getStudentByVkId( ctx.message.user_id );
                    }

                    Student.settings.notificationTime = body;
                    Student.save();

                    ctx.scene.enter( "default" );
                    ctx.reply(
                        "Время получения уведомлений успешно изменено на " + body,
                        null,
                        await createDefaultKeyboard( ctx.session.isAdmin, ctx.session.isContributor, ctx )
                    )
                } else {
                    ctx.reply( "Проверьте правильность введенного времени, оно должно быть в формате ЧЧ:ММ" )
                }
            } else {
                ctx.reply( "Проверьте правильность введенного времени, оно должно быть в формате ЧЧ:ММ" )
            }
        } catch ( e ) {
            console.error( e );
            ctx.scene.enter( "error" );
        }
    }
)

module.exports.adminPanelScene = new Scene( 'adminPanel',
    async ( ctx ) => {
        if ( ctx.session.isAdmin ?? ( await DataBase.getRole( ctx.message.user_id ) === Roles.admin ) ) {
            ctx.scene.next();
            ctx.reply( renderAdminMenu(), null, renderAdminMenuKeyboard() );
        } else {
            ctx.scene.leave();
            ctx.reply( "Ты не админ чтоб такое делать" )
        }
    },
    async ( ctx ) => {
        try {
            if ( [ "0", botCommands.back ].includes( ctx.message.body.trim() ) ) {
                ctx.scene.enter( "default" );
                return;
            }

            switch ( ctx.message.body.trim() ) {
                case "1": {
                    ctx.scene.enter( "addRedactor" );
                    break;
                }
                case "2": {
                    ctx.scene.enter( "removeRedactor" );
                    break;
                }
                case "3": {
                    const Contributors = await DataBase.getAllContributors();

                    if ( Contributors.length > 0 ) {

                        const classesStr = mapListToMessage( Contributors.map( ( { firstName, secondName, vkId } ) => `${firstName} ${secondName} (${vkId})` ) );

                        const message = "Список всех редакторов\n\t" + classesStr;

                        ctx.reply( message, null, await createDefaultKeyboard( true ) );
                    } else {
                        ctx.reply( "Не существует ни одного редактора", null, await createDefaultKeyboard( true ) );
                    }
                    ctx.scene.enter( "default" );
                    break;
                }
                case "4": {
                    ctx.scene.enter( "createClass" );
                    break;
                }
                case "5": {
                    const Classes = await DataBase.getAllClasses();

                    if ( Classes.length > 0 ) {

                        const classesStr = mapListToMessage( Classes.map( ( { name } ) => name ) );

                        const message = "Список всех классов\n\t" + classesStr;

                        ctx.reply( message, null, await createDefaultKeyboard( true, false ) );
                    } else {
                        ctx.reply( "Не существует ни одного класса", null, await createDefaultKeyboard( true, false ) );
                    }
                    ctx.scene.enter( "default" );
                    break;
                }
                default: {
                    ctx.reply( botCommands.notUnderstood );
                    break;
                }
            }
        } catch ( e ) {
            ctx.scene.leave();
            ctx.reply( "Простите произошла ошибка", null, await createDefaultKeyboard( true, false ) );
            console.error( e );
        }
    },
);
module.exports.addRedactor = new Scene( "addRedactor",
    ( ctx ) => {
        ctx.reply( "Введите id пользователя, которого хотите сделать редактором", null, createBackKeyboard() );
        ctx.scene.next();
    },
    async ( ctx ) => {
        try {
            if ( ctx.message.body.trim() === botCommands.back ) {
                ctx.scene.enter( "default" );
            }
            const { message: { body }, scene: { leave, enter } } = ctx;
            const id = Number( body.trim() );

            if ( !isNaN( id ) ) {
                let Student = await DataBase.getStudentByVkId( id );

                if ( Student && Student.role === Roles.admin ) {
                    ctx.reply( "Пользователь уже является администратором", null, await createDefaultKeyboard( true, false ) );
                    ctx.scene.enter( "default" );
                    return;
                } else if ( Student && Student.role === Roles.contributor ) {
                    ctx.reply( "Пользователь уже является редактором", null, await createDefaultKeyboard( true, false ) );
                    ctx.scene.enter( "default" );
                    return;
                }

                if ( !Student ) {
                    const response = await vk.api( "users.get", { user_ids: id } );
                    console.log( response );
                    if ( !response.error_code && response ) {
                        const { first_name, last_name } = response[ 0 ];
                        Student = await DataBase.createStudent( id, { firstName: first_name, lastName: last_name } );
                    } else {
                        throw new Error();
                    }
                }

                Student.role = Roles.contributor;
                await Student.save();

                ctx.reply( "Пользователь стал редактором", null, await createDefaultKeyboard( true, false ) );
                ctx.scene.enter( "default" );
            } else {
                ctx.reply( "Неверный id" );
                ctx.scene.enter( "addRedactor" );
            }
        } catch ( e ) {
            ctx.scene.leave();
            ctx.reply( "Простите произошла ошибка", null, await createDefaultKeyboard( true, false ) );
            console.error( e );
        }
    },
)
module.exports.removeRedactor = new Scene( "removeRedactor",
    ( ctx ) => {
        ctx.reply( "Введите id пользователя, которого хотите сделать редактором", null, createBackKeyboard() );
        ctx.scene.next();
    },
    async ( ctx ) => {
        try {
            if ( ctx.message.body.trim() === botCommands.back ) {
                ctx.scene.enter( "default" );
            }
            const { message: { body }, scene: { leave, enter } } = ctx;
            const id = Number( body.trim() );

            if ( !isNaN( id ) ) {
                let Student = await DataBase.getStudentByVkId( id );

                if ( Student && Student.role === Roles.admin ) {
                    ctx.reply( "Пользователя нельзя понизить в роли, так как он является администратором", null, await createDefaultKeyboard( true, false ) );
                    ctx.scene.enter( "default" );
                    return;
                } else if ( !Student || Student.role === Roles.student ) {
                    ctx.reply( "Пользователь уже не является редактором", null, await createDefaultKeyboard( true, false ) );
                    ctx.scene.enter( "default" );
                    return;
                }

                Student.role = Roles.student;
                await Student.save();

                ctx.reply( "Пользователь перестал быть редактором", null, await createDefaultKeyboard( true, false ) );
                ctx.scene.enter( "default" );
            } else {
                ctx.reply( "Неверный id" );
                ctx.scene.enter( "removeRedactor" );
            }
        } catch ( e ) {
            ctx.scene.leave();
            ctx.reply( "Простите произошла ошибка", null, await createDefaultKeyboard( true, false ) );
            console.error( e );
        }
    },
)
module.exports.createClassScene = new Scene( 'createClass',
    ( ctx ) => {
        ctx.reply( "Введите имя класса (цифра буква)", null, createBackKeyboard() );
        ctx.scene.next();
    },
    ( ctx ) => {
        if ( ctx.message.body.trim() === botCommands.back ) {
            ctx.scene.enter( "default" );
        }
        const { message: { body }, scene: { leave, enter } } = ctx;
        const spacelessClassName = body.replace( /\s*/g, "" );
        if ( /\d+([a-z]|[а-я])/i.test( spacelessClassName ) ) {
            DataBase.createClass( spacelessClassName )
                .then( result => {
                    if ( result ) {
                        leave();
                        ctx.reply( "Класс успешно создан" );
                    } else {
                        ctx.reply( "Создание класса не удалось" );
                    } //исправить (вынести в функцию\превратить старт в сцену\еще что то)
                } )
                .catch( err => {
                    console.log( err );
                    ctx.reply( "Что то пошло не так попробуйте позже" )
                } )
        } else {
            enter( "createClass" );
            ctx.reply( "Неправильный формат ввода (должна быть цифра и потом буква)" );
        }
    },
);

module.exports.contributorPanelScene = new Scene( 'contributorPanel',
    async ( ctx ) => {
        if ( ( ctx.session.isContributor || ctx.session.isAdmin ) ?? ( await DataBase.getRole( ctx.message.user_id ) !== Roles.student ) ) {
            ctx.scene.next();
            ctx.reply( renderContributorMenu(), null, renderContributorMenuKeyboard() );
        } else {
            ctx.scene.leave();
            ctx.reply( "Ты не редактор чтоб такое делать" )
        }
    },
    async ( ctx ) => {
        try {
            if ( [ "0", botCommands.back ].includes( ctx.message.body.trim() ) ) {
                ctx.scene.enter( "default" );
                return;
            }

            switch ( ctx.message.body.trim() ) {
                case "1": {
                    ctx.scene.enter( "addHomework" );
                    break;
                }
                case "2": {
                    ctx.scene.enter( "addChange" );
                    break;
                }
                case "3": {
                    ctx.scene.enter( "changeSchedule" );
                    break;
                }
                default: {
                    ctx.reply( botCommands.notUnderstood );
                    break;
                }
            }
        } catch ( e ) {
            ctx.scene.leave();
            ctx.reply( "Простите произошла ошибка", null, await createDefaultKeyboard( true, false ) );
            console.error( e );
        }
    },
);
module.exports.addHomeworkScene = new Scene( "addHomework",
    async ( ctx ) => {
        try {
            if ( ctx.message.body.trim() === botCommands.back ) {
                ctx.scene.enter( "default" );
                return;
            }

            const needToPickClass = ctx.session.isAdmin ?? await DataBase.getRole( ctx.message.user_id ) === Roles.admin
            if ( needToPickClass && !ctx.session.Class ) {
                ctx.session.nextScene = "addHomework";
                ctx.scene.enter( "pickClass" );
            } else {
                const Student = await DataBase.getStudentByVkId( ctx.session.userId || ctx.message.user_id );

                if ( Student ) {
                    if ( Student.registered ) {
                        if ( !ctx.session.Class ) ctx.session.Class = await DataBase.getClassBy_Id( Student.class );

                        ctx.scene.next();
                        ctx.reply( "Введите содержимое дз (можно прикрепить фото)", null, createBackKeyboard() );
                    } else {
                        ctx.scene.enter( 'register' );
                        ctx.reply( "Сначала вам необходимо зарегестрироваться, введите имя класса в котором вы учитесь" );
                    }
                } else {
                    console.log( "user are not existing", ctx.session.userId );
                    throw new Error();
                }
            }
        } catch ( e ) {
            console.error( e );
            ctx.scene.enter( "error" );
        }
    },
    async ( ctx ) => {
        try {
            const { message: { body = "", attachments = [] } } = ctx;

            if ( body === botCommands.back ) {
                const peekedClass = ( ctx.session.isAdmin || ctx.session.isContributor ) ?? await DataBase.getRole( ctx.message.user_id ) !== Roles.student;
                //TODO только админы могут выбирать класс редакторы работают в пределах своего класса
                if ( peekedClass ) {
                    ctx.session.Class = undefined;
                    ctx.scene.enter( "contributorPanel" );
                } else {
                    ctx.scene.enter( "default" );
                }
                return;
            }

            if ( attachments.every( att => att.type === "photo" ) ) {
                const parsedAttachments = attachments.map( att => ( {
                    value: parseAttachments( att ),
                    url: findMaxPhotoResolution( att[ att.type ] ),
                    album_id: att[ att.type ].album_id
                } ) );

                ctx.session.newHomework = { text: body, attachments: parsedAttachments };

                const possibleLessons = ctx.session.Class.schedule.flat().filter( ( l, i, arr ) => i === arr.lastIndexOf( l ) ); //Pick onlu unique lessons
                ctx.session.possibleLessons = possibleLessons;

                ctx.scene.next();
                ctx.reply( "Выбирите урок:\n" + mapListToMessage( possibleLessons ) );
            } else {
                ctx.reply( "Отправлять можно только фото" );
            }
        } catch ( e ) {
            console.error( e );
            ctx.scene.enter( "error" );
        }
    },
    ( ctx ) => {
        try {
            let { message: { body } } = ctx;

            if ( body === botCommands.back ) {
                ctx.session.newHomework.attachment = undefined;
                ctx.session.newHomework.text = undefined;
                ctx.scene.selectStep( 1 );
                ctx.reply( "Введите содержимое дз (можно прикрепить фото)", null, createBackKeyboard() );
            }

            if ( !isNaN( +body ) || ctx.session.possibleLessons.includes( body ) ) {
                const lesson = ctx.session.possibleLessons[ +body - 1 ] || body;

                ctx.session.newHomework.lesson = lesson;

                ctx.scene.next();
                ctx.reply(
                    "Введите дату на которую задано задание (в формате дд.ММ.ГГГГ)",
                    null,
                    createBackKeyboard( [ Markup.button( botCommands.onNextLesson, "positive" ) ], 1 )
                );
            } else {
                if ( Lessons.includes( body ) ) {
                    ctx.reply( "Вы можете вводить только доступные уроки" );
                } else {
                    ctx.reply( "Вы должны ввести цифру или название урока" );
                }
            }
        } catch ( e ) {
            console.log( e );
            ctx.scene.enter( "error" );
        }

    },
    async ( ctx ) => {
        try {
            const { message: { body } } = ctx;

            if ( body === botCommands.back ) {
                ctx.session.newHomework.lesson = undefined;
                ctx.scene.selectStep( 2 );
                ctx.reply( "Выбирите урок:\n" + mapListToMessage( ctx.session.possibleLessons, 1 ), null, createBackKeyboard() );
            }

            if ( body === botCommands.onNextLesson ) {
                const datePrediction =
                    findNextLessonDate( findNextDayWithLesson(
                        ctx.session.Class.schedule,
                        ctx.session.newHomework.lesson,
                        ( new Date() ).getDay() || 7 )
                    );

                ctx.session.newHomework.to = datePrediction;
            } else if ( /[0-9]+\.[0-9]+\.[0-9]/.test( body ) ) {
                const [ day, month, year ] = body.match( /([0-9]+)\.([0-9]+)\.([0-9]+)/ ).slice( 1 ).map( Number );
                if (
                    month >= 0 &&
                    month < 12 &&
                    day > 0 &&
                    day < maxDatesPerMonth[ month - 1 ] &&
                    year >= ( new Date() ).getFullYear()
                ) {
                    const date = new Date( year, month - 1, day );

                    if ( date.getTime() >= Date.now() ) {
                        ctx.session.newHomework.to = date;
                    } else {
                        ctx.reply( "Дата не может быть в прошлом" );
                    }
                } else {
                    ctx.reply( "Проверьте правильность введенной даты" );
                }
            } else {
                ctx.reply( "Дата должна быть в формате дд.ММ.ГГГГ" );
                return;
            }

            if ( ctx.session.newHomework.to ) {
                ctx.scene.next();
                ctx.reply( `
                Вы уверены что хотите создать такое задание?
                ${createContentDiscription(
                    ctx.session.newHomework,
                )}
                `, ctx.session.newHomework.attachments.map( ( { value } ) => value ), createConfirmKeyboard() );
            } else {
                throw new Error();
            }
        } catch ( e ) {
            console.error( e );
            ctx.scene.enter( "error" );
        }
    },
    async ( ctx ) => {
        try {
            const { message: { body: answer } } = ctx;

            if ( answer.trim().toLowerCase() === botCommands.yes.toLowerCase() ) {
                const { newHomework: { to, lesson, text, attachments }, Class: { name: className } } = ctx.session;
                ctx.session.Class = undefined;

                const res = await DataBase.addHomework( className, lesson, { text, attachments }, ctx.message.user_id, to );

                if ( res ) {
                    ctx.scene.enter( "default" );
                    ctx.reply( "Домашнее задание успешно создано", null, await createDefaultKeyboard( ctx.session.isAdmin, ctx.session.isContributor, ctx ) );
                } else {
                    ctx.scene.enter( "default" );
                    ctx.reply( "Простите произошла ошибка", null, await createDefaultKeyboard( ctx.session.isAdmin, ctx.session.isContributor, ctx ) );
                }
            } else {
                ctx.reply( "Введите дату на которую задоно задание (в формате дд.ММ.ГГГГ)" );
                ctx.selectStep( 3 );
            }
        } catch ( e ) {
            console.error( e );
            ctx.scene.enter( "error" )
        }
    }
)
module.exports.addChangeScene = new Scene( "addChange",
    async ( ctx ) => {
        try {
            if ( ctx.message.body.trim() === botCommands.back ) {
                ctx.scene.enter( "default" );
                return;
            }

            const needToPickClass = ctx.session.isAdmin ?? await DataBase.getRole( ctx.message.user_id ) === Roles.admin
            if ( needToPickClass && !ctx.session.Class ) {
                ctx.session.nextScene = "addChange";
                ctx.scene.enter( "pickClass" );
            } else {
                const Student = await DataBase.getStudentByVkId( ctx.session.userId || ctx.message.user_id );

                if ( Student ) {
                    if ( Student.registered ) {
                        if ( !ctx.session.Class ) ctx.session.Class = await DataBase.getClassBy_Id( Student.class );

                        ctx.scene.next();
                        ctx.reply( "Введите содержимое изменения (можно прикрепить фото)", null, createBackKeyboard() );
                    } else {
                        ctx.scene.enter( 'register' );
                        ctx.reply( "Сначала вам необходимо зарегестрироваться, введите имя класса в котором вы учитесь" );
                    }
                } else {
                    console.log( "user are not existing", ctx.session.userId );
                    throw new Error();
                }
            }
        } catch ( e ) {
            console.error( e );
            ctx.scene.enter( "error" );
        }
    },
    async ( ctx ) => {
        try {
            const { message: { body = "", attachments = [] } } = ctx;

            if ( body === botCommands.back ) {
                const peekedClass = ( ctx.session.isAdmin || ctx.session.isContributor ) ?? await DataBase.getRole( ctx.message.user_id ) !== Roles.student;
                //TODO только админы могут выбирать класс редакторы работают в пределах своего класса
                if ( peekedClass ) {
                    ctx.session.Class = undefined;
                    ctx.scene.enter( "contributorPanel" );
                } else {
                    ctx.scene.enter( "default" );
                }
                return;
            }

            if ( attachments.every( att => att.type === "photo" ) ) {
                const parsedAttachments = attachments.map( att => ( {
                    value: parseAttachments( att ),
                    url: findMaxPhotoResolution( att[ att.type ] ),
                    album_id: att[ att.type ].album_id
                } ) );

                ctx.session.newChange = { text: body, attachments: parsedAttachments };

                ctx.scene.next();
                ctx.reply(
                    "Введите дату изменения (в формате дд.ММ.ГГГГ)",
                    null,
                    createBackKeyboard( [ Markup.button( botCommands.onToday, "positive" ) ], 1 )
                )
            } else {
                ctx.reply( "Отправлять можно только фото" );
            }
        } catch ( e ) {
            console.error( e );
            ctx.scene.enter( "error" );
        }
    },
    async ( ctx ) => {
        try {
            const { message: { body } } = ctx;

            if ( body === botCommands.back ) {
                ctx.session.newChange.lesson = undefined;
                ctx.scene.selectStep( 1 );
                ctx.reply( "Введите содержимое изменения (можно прикрепить фото)", null, createBackKeyboard() );
            }

            if ( body === botCommands.onToday ) {
                ctx.session.newChange.to = new Date();
            } else if ( /[0-9]+\.[0-9]+\.[0-9]/.test( body ) ) {
                const [ day, month, year ] = body.match( /([0-9]+)\.([0-9]+)\.([0-9]+)/ ).slice( 1 ).map( Number );
                if (
                    month >= 0 &&
                    month < 12 &&
                    day > 0 &&
                    day < maxDatesPerMonth[ month - 1 ] &&
                    year >= ( new Date() ).getFullYear()
                ) {
                    const date = new Date( year, month - 1, day );

                    if ( date.getTime() >= Date.now() ) {
                        ctx.session.newChange.to = date;
                    } else {
                        ctx.reply( "Дата не может быть в прошлом" );
                    }
                } else {
                    ctx.reply( "Проверьте правильность введенной даты" );
                }
            } else {
                ctx.reply( "Дата должна быть в формате дд.ММ.ГГГГ" );
                return;
            }

            if ( ctx.session.newChange.to ) {
                ctx.scene.next();
                ctx.reply( `
                Вы уверены что хотите создать такое изменение?
                ${createContentDiscription(
                    ctx.session.newChange,
                )}
                `, ctx.session.newChange.attachments.map( ( { value } ) => value ), createConfirmKeyboard() );
            } else {
                throw new Error();
            }
        } catch ( e ) {
            console.error( e );
            ctx.scene.enter( "error" );
        }
    },
    async ( ctx ) => {
        try {
            const { message: { body: answer } } = ctx;

            if ( answer.trim().toLowerCase() === botCommands.yes.toLowerCase() ) {
                const { newChange: { to, text, attachments }, Class: { name: className } } = ctx.session;
                ctx.session.Class = undefined;

                const res = await DataBase.addChanges( className, { text, attachments }, to, false, ctx.message.user_id );

                if ( res ) {
                    ctx.scene.enter( "default" );
                    ctx.reply( "Изменение в расписании успешно создано", null, await createDefaultKeyboard( ctx.session.isAdmin, ctx.session.isContributor, ctx ) );
                } else {
                    ctx.scene.enter( "default" );
                    ctx.reply( "Простите произошла ошибка", null, await createDefaultKeyboard( ctx.session.isAdmin, ctx.session.isContributor, ctx ) );
                }
            } else {
                ctx.reply(
                    "Введите дату изменения (в формате дд.ММ.ГГГГ)",
                    null,
                    createBackKeyboard( [ Markup.button( botCommands.onToday, "positive" ) ], 1 )
                )
                ctx.selectStep( 3 );
            }
        } catch ( e ) {
            console.error( e );
            ctx.scene.enter( "error" )
        }
    }
)
module.exports.changeScheduleScene = new Scene( "changeSchedule",
    async ( ctx ) => {
        ctx.session.isFullFill = false;
        ctx.session.changingDay = undefined;

        try {
            const needToPickClass = ctx.session.isAdmin ?? await DataBase.getRole( ctx.message.user_id ) === Roles.admin
            if ( needToPickClass && !ctx.session.Class ) {
                ctx.session.nextScene = "changeSchedule";
                ctx.session.step = 0;
                ctx.scene.enter( "pickClass" );
            } else {
                const Student = await DataBase.getStudentByVkId( ctx.session.userId || ctx.message.user_id );

                if ( Student ) {
                    if ( Student.registered ) {
                        let { Class } = ctx.session;
                        if ( !Class ) Class = await DataBase.getClassBy_Id( Student.class );

                        ctx.session.Class = Class;
                        ctx.session.schedule = Class.schedule;


                        const days = Object.values( daysOfWeek );
                        const buttons = days.map( ( day, index ) => Markup.button( index + 1, "default", { button: day } ) );

                        buttons.push( Markup.button( "0", "primary" ) );

                        const message = "Выберите день у которого хотите изменить расписание\n" + mapListToMessage( days ) + "\n0. Заполнить всё";

                        ctx.scene.next();
                        ctx.reply( message, null, createBackKeyboard( buttons ) );
                    } else {
                        ctx.scene.enter( 'register' );
                        ctx.reply( "Сначала вам необходимо зарегестрироваться, введите имя класса в котором вы учитесь" );
                    }
                } else {
                    console.log( "user are not existing", ctx.session.userId );
                    throw new Error();
                }
            }
        } catch ( e ) {
            console.error( e );
            ctx.scene.enter( "error" );
        }
    },
    async ( ctx ) => {
        try {
            const { message: { body } } = ctx;

            if ( body.toLowerCase === botCommands.back ) {
                ctx.scene.enter( "default" );
            }

            if ( [ "заполнить всё", "все", "0", "всё", "заполнить всё" ].includes( body.toLowerCase() ) ) {
                ctx.session.isFullFill = true;
                ctx.session.changingDay = 1;
                const message = `
            Введите новое расписание цифрами через запятую или пробел, выбирая из этих предметов\n
            ${ lessonsList} \n
            Сначала понедельник:
            `;

                ctx.scene.next();
                ctx.reply( message, null, createBackKeyboard( [ Markup.button( botCommands.leaveEmpty, "primary" ) ], 1 ) );
            } else if ( ( !isNaN( +body ) && +body >= 1 && +body <= 7 ) || Object.values( daysOfWeek ).includes( body ) ) {
                ctx.session.changingDay = +body;

                const message = `Введите новое расписание цифрами через запятую или пробел, выбирая из этих предметов\n ${lessonsList} `;

                ctx.scene.next();
                ctx.reply( message, null, createBackKeyboard( [ Markup.button( botCommands.leaveEmpty, "primary" ) ], 1 ) );
            } else {
                ctx.reply( "Неверно введен день" );
            }
        } catch ( e ) {
            console.error( e );
            ctx.scene.enter( "error" );
        }
    },
    ( ctx ) => {
        try {
            let { message: { body } } = ctx;

            if ( body === botCommands.leaveEmpty ) {
                body = "";
            }

            body = body.replace( /,/g, " " );

            let indexes = body.trim().split( " " ).filter( Boolean );
            if ( indexes.every( index => !isNaN( +index ) ) ) {
                indexes = indexes.map( i => +i );
                if ( indexes.every( index => index >= 0 && index < Lessons.length ) ) {
                    const newLessons = indexes.map( i => Lessons[ i ] );
                    ctx.session.schedule[ ctx.session.changingDay - 1 ] = newLessons;

                    if ( !ctx.session.isFullFill || ctx.session.changingDay === Object.keys( daysOfWeek ).length ) {
                        ctx.scene.next();

                        const newScheduleStr = ctx.session.isFullFill
                            ? ctx.session.schedule.map( ( lessons, i ) => `${daysOfWeek[ i ]}: \n ${mapListToMessage( lessons )} ` )
                            : mapListToMessage( newLessons );
                        const isEmpty = ctx.session.isFullFill
                            ? ctx.session.schedule.every( lessons => lessons.length === 0 )
                            : newLessons.length === 0;
                        const message = !isEmpty
                            ? "Вы уверены, что хотите изменить расписание на это:\n" + newScheduleStr + "?"
                            : "Вы уверены, что хотите оставить расписание пустым?";

                        ctx.reply(
                            message,
                            null,
                            createConfirmKeyboard()
                        );
                    } else {
                        ctx.session.changingDay++;
                        ctx.scene.selectStep( 2 );
                        ctx.reply( daysOfWeek[ ctx.session.changingDay - 1 ] + ":" );
                    }
                } else {
                    ctx.reply( "Проверьте правильность введенного расписания" );
                }
            } else {
                ctx.reply( "Вы должны вводить только цифры" )
            }
        } catch ( e ) {
            console.log( e );
            ctx.scene.enter( "error" );
        }
    },
    async ( ctx ) => {
        try {
            const { message: { body } } = ctx;
            const { schedule, Class } = ctx.session;
            ctx.session.Class = undefined;

            if ( body.toLowerCase() === "да" ) {
                if ( schedule && Class ) {
                    await Class.updateOne( { schedule } );
                    ctx.scene.enter( "default" );
                    ctx.reply( "Расписание успешно обновлено", null, await createDefaultKeyboard( true, false ) );
                } else {
                    console.log( "Schedule is ", schedule, "Class is ", Class );
                    throw new Error();
                }
            } else {
                ctx.reply( "Введите новое расписание" );
                ctx.scene.selectStep( 2 );
            }
        } catch ( e ) {
            console.error( e );
            ctx.scene.enter( "error" );
        }
    }
)

module.exports.pickClassScene = new Scene( "pickClass",
    async ( ctx ) => {
        try {
            const Classes = await DataBase.getAllClasses();
            if ( Classes.length > 0 ) {
                ctx.session.classes = Classes;

                const classesStr = mapListToMessage( Classes.map( ( { name } ) => name ) );

                const message = "Для какого класса вы хотите посмотреть расписание?\n" + classesStr;

                ctx.scene.next();
                const columns = Classes.length % 4 === 0
                    ? 4
                    : Classes.length % 3 === 0
                        ? 3
                        : Classes.length % 2 === 0
                            ? 2
                            : 4
                ctx.reply( message, null, createBackKeyboard( Classes.map( ( { name }, i ) => Markup.button( i + 1, "default", { button: name } ) ), columns ) );
            } else {
                ctx.scene.enter( "default" );
                ctx.reply( "Не существует ни одного класса" )
            };
        } catch ( e ) {
            console.error( e );
            ctx.scene.enter( "error" );
        }
    },
    async ( ctx ) => {
        try {
            if ( ctx.message.body === botCommands.back ) {
                ctx.scene.enter( "default" );
                return;
            }

            const { message: { body: classIndex } } = ctx;

            let { classes } = ctx.session;

            if ( !classes ) {
                classes = await DataBase.getAllClasses();
            }

            let Class;
            if ( isValidClassName( classIndex ) ) {
                Class = classes.find( ( { name } ) => name === classIndex );
            } else if ( !isNaN( classIndex ) ) {
                Class = classes[ classIndex - 1 ];
            }

            if ( Class ) {
                ctx.session.Class = Class;
                ctx.scene.enter( ctx.session.nextScene, ctx.session.step );
            } else {
                ctx.reply( "Неверное имя класса" );
            }

            ctx.session.classses = undefined;
        } catch ( e ) {
            console.error( e );
            ctx.scene.enter( "error" );
        }
    },
)
async function getScheduleString ( { schedule } ) {
    const message = schedule.map( ( lessons, i ) => {
        const dayName = daysOfWeek[ i ];

        const dayMessage = lessons.length > 0 ? `${dayName}: \n ${mapListToMessage( lessons )} ` : "";

        return dayMessage;
    } ).join( "\n\n" );


    return message
}

