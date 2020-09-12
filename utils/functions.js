const { mapHomeworkByLesson } = require( "bot-database/utils/functions" );
const { DataBase: DB } = require( "bot-database/DataBase" );
const config = require( "../config.json" );
const { monthsRP } = require( "./messagePayloading" );

const DataBase = new DB( config[ "MONGODB_URI" ] );

const dayInMilliseconds = 24 * 60 * 60 * 1000;

async function notifyStudents ( botInstance ) {
    try {
        const Classes = await DataBase.getAllClasses();

        for ( const Class of Classes ) {
            await sendHomeworkToClassStudents( Class, botInstance );
        }
    } catch ( e ) {
        console.error( e );
    }
};
async function sendHomeworkToClassStudents ( Class, botInstance ) {
    try {
        const { students } = await DataBase.populate( Class );
        if ( students?.length ) {
            const daysOffsets = new Set( students.map( ( { settings } ) => settings.daysForNotification ).flat() );

            for ( const dayOffset of daysOffsets ) {
                const notifiableIds = getNotifiableIds( students.filter( ( { settings } ) => settings.daysForNotification.includes( dayOffset ) ) );

                if ( notifiableIds.length > 0 ) {
                    const dateWithOffset = getDateWithOffset( dayOffset );
                    const dayHomework = await DataBase.getHomeworkByDate( Class, dateWithOffset );

                    if ( dayHomework.length > 0 ) {
                        const parsedHomework = mapHomeworkByLesson( dayHomework );

                        let message = `Задание на ${isOneDay( dateWithOffset, getTomorrowDate() ) ? "завтра" : getDayMonthString( dateWithOffset )}\n`;
                        botInstance.sendMessage( notifiableIds, message );

                        sendHomework( parsedHomework, botInstance, notifiableIds );
                    }
                }
            }
        }
    } catch ( e ) {
        console.error( e );
    }
}

function getNotifiableIds ( students ) {
    const ids = [];

    for ( const { settings: { notificationsEnabled, notificationTime, daysForNotification }, lastHomeworkCheck, vkId } of students ) {
        if ( notificationsEnabled ) {
            const [ hours, mins ] = notificationTime
                .match( /([0-9]+):([0-9]+)/ )
                .slice( 1 )
                .map( Number );

            if ( isReadyToNotificate( hours, mins, lastHomeworkCheck, daysForNotification ) ) {
                ids.push( vkId );
                DataBase.changeLastHomeworkCheckDate( vkId, new Date() );
            }
        }
    }

    return ids;
}
function isReadyToNotificate ( hours, mins, lastHomeworkCheck ) {
    const hoursNow = new Date().getHours();
    const minsNow = new Date().getMinutes();

    return hours <= hoursNow && mins <= minsNow && !isToday( lastHomeworkCheck );
}

function sendHomework ( parsedHomework, botInstance, notifiableIds ) {
    if ( notifiableIds.length > 0 ) {
        let index = 1;

        for ( const [ lesson, homework ] of parsedHomework ) {
            let { homeworkMessage, attachments } = getHomeworkPayload( lesson, homework );

            setTimeout( () => {
                console.log( "КОГО ОПОВЕЩАТЬ: ", notifiableIds )
                botInstance.sendMessage( notifiableIds, homeworkMessage, attachments )
            }, index++ * 15 );
        }
    }
}
function getHomeworkPayload ( lesson, homework ) {
    let homeworkMessage = `${lesson}:\n`;
    let attachments = [];

    for ( let i = 0; i < homework.length; i++ ) {
        const hw = homework[ i ];
        homeworkMessage += hw.text ? `${i + 1}: ${hw.text}\n` : "";
        attachments = attachments.concat(
            hw.attachments?.map( ( { value } ) => value )
        );
    }
    return { homeworkMessage, attachments };
}

function findMaxPhotoResolution ( photo ) {
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
};

function getDateWithOffset ( offset ) {
    const date = new Date();
    return new Date( date.getFullYear(), date.getMonth(), date.getDate() + offset );
}
function getTomorrowDate () {
    return getDateWithOffset( 1 );
}

function isOneDay ( aDate, bDate ) {
    return (
        aDate.getFullYear() === bDate.getFullYear() &&
        aDate.getMonth() === bDate.getMonth() &&
        aDate.getDate() === bDate.getDate()
    )
}
function isToday ( date ) {
    return isOneDay( date, new Date() );
}

function inRange ( number, min, max ) {
    if ( min !== undefined && min > number ) {
        return false;
    }
    if ( max !== undefined && max < number ) {
        return false;
    }

    return true;
}

function filterContentByDate ( content, date ) {
    return content.filter( ( { to } ) => {
        return inRange( to.getTime() - date.getTime(), 0, 24 * 60 * 60 * 1000 - 1 );
    } )
}

function getDayMonthString ( date ) {
    return `${date.getDate()} ${monthsRP[ date.getMonth() ]}`;
}

module.exports = {
    isToday,
    getTomorrowDate,
    notifyStudents,
    findMaxPhotoResolution,
    sendHomeworkToClassStudents,
    getNotifiableIds,
    isReadyToNotificate,
    sendHomework,
    getHomeworkPayload,
    inRange,
    filterContentByDate,
    getDayMonthString
};
