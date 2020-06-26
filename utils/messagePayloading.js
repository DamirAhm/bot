const { Lessons, Roles } = require( "../DataBase/Models/utils" );
const config = require( "config" );
const Markup = require( "node-vk-bot-api/lib/markup" );
const botCommands = require( "./botCommands" );
const { DataBase: DB } = require( "../DataBase/DataBase" );

const DataBase = new DB( config.get( "MONGODB_URI" ) );

const userOptions = [
    { label: botCommands.checkHomework, payload: "checkHomework", color: "primary" },
    { label: botCommands.checkSchedule, payload: "checkSchedule", color: "primary" },
    { label: botCommands.studentPanel, payload: "studentPanel", color: "primary" },
]
const contributorOptions = [
    { label: "Добавить дз", payload: "addHomework", color: "default" },
    { label: "Добавить изменения в расписании", payload: "addChange", color: "default" },
    { label: "Изменить расписание", payload: "changeSchedule", color: "default" },
]
const adminOptions = [
    { label: "Добавить редактора", payload: "addRedactor", color: "default" },
    { label: "Удалить редактора", payload: "removeRedactor", color: "default" },
    { label: "Список редакторов", payload: "redactorsList", color: "default" },
    { label: "Добавить класс", payload: "addClass", color: "default" },
    { label: "Список классов", payload: "classList", color: "default" },
];

const mapListToMessage = ( list ) => {
    return list.map( ( e, i ) => `${i + 1}. ${e}` ).join( "\n" );
};
const formMessage = ( ...messageSections ) => {
    return messageSections.join( "\n" );
};

const renderAdminMenu = () => {
    return formMessage(
        "Админское меню\n",
        ...adminOptions.map( ( { label }, i ) => `${i + 1}. ${label}` ),
        "0: Назад"
    );
};
const renderAdminMenuKeyboard = () => {
    const buttons = adminOptions.map( ( opt, i ) => Markup.button( i + 1, "default", { button: opt.payload } ) )

    buttons.push( Markup.button( "Назад", "negative", { button: "back" } ) );

    return Markup.keyboard( buttons, { columns: 3 } );
}

const renderContributorMenu = () => {
    return formMessage(
        "Меню редактора\n",
        ...contributorOptions.map( ( { label }, i ) => `${i + 1}. ${label}` ),
        "0: Назад"
    );
};
const renderContributorMenuKeyboard = () => {
    const buttons = contributorOptions.map( ( opt, i ) => Markup.button( i + 1, "default", { button: opt.payload } ) )

    buttons.push( Markup.button( "Назад", "negative", { button: "back" } ) );

    return Markup.keyboard( buttons, { columns: 3 } );
}

const isAdmin = ( userId ) => {
    return config.get( "admins" ).includes( userId );
};

const parseAttachments = ( attachments ) => {
    if ( Array.isArray( attachments ) && attachments.every( att => att.type && att[ att.type ] ) ) {
        return attachments.map( att => `${att.type}${att[ att.type ].owner_id}_${att[ att.type ].id}${att[ att.type ].access_key ? "_" + att[ att.type ].access_key : ""}` )
    } else {
        throw new TypeError( "Wrong attachments type" );
    }
};

const createDefaultMenu = () => {
    return formMessage(
        "Меню:",
        ...userOptions.map( ( { label }, i ) => `${i + 1}. ${label}` )
    )
}
const createDefaultKeyboard = async ( isAdmin, isContributor, ctx ) => {
    try {
        let buttons = userOptions.map( ( { label, payload, color } ) => Markup.button( label, color, { button: payload } ) );

        if ( isContributor === undefined && !isAdmin ) {
            ctx.session.isAdmin = await DataBase.getRole( ctx.message.user_id ) === Roles.contributor;
            isAdmin = ctx.session.isAdmin;
        }
        if ( isAdmin === undefined ) {
            ctx.session.isAdmin = await DataBase.getRole( ctx.message.user_id ) === Roles.admin;
            isAdmin = ctx.session.isAdmin;
        }

        if ( isContributor || isAdmin ) {
            buttons.push( Markup.button( botCommands.contributorPanel, "primary", { button: "contributorPanel" } ) );
        }
        if ( isAdmin ) {
            buttons.push( Markup.button( botCommands.adminPanel, "positive", { button: "adminMenu" } ) );
        }

        return Markup.keyboard( buttons, { columns: buttons.length > 2 ? 2 : 1 } );
    } catch ( e ) {
        console.error( e );
    }
}

const createBackKeyboard = ( existingButtons = [], columns = 4 ) => {
    existingButtons.push( Markup.button( botCommands.back, "negative", { button: "back" } ) );

    return Markup.keyboard( existingButtons, { columns } );
}

const lessonsList = mapListToMessage( Lessons );

module.exports = {
    formMessage,
    isAdmin,
    renderAdminMenu,
    parseAttachments,
    createDefaultKeyboard,
    renderAdminMenuKeyboard,
    createBackKeyboard,
    createDefaultMenu,
    renderContributorMenuKeyboard,
    renderContributorMenu,
    mapListToMessage,
    lessonsList
};