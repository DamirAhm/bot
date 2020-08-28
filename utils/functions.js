const { mapHomeworkByLesson } = require( "bot-database/utils/functions" );
const { DataBase: DB } = require( "bot-database/DataBase" );
const config = require( "../config.json" );

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
    const tomorrowHomework = await DataBase.getHomeworkByDate(
        Class,
        getTomorrowDate()
    );

    if ( tomorrowHomework.length > 0 ) {
        const { students } = await Class.populate( "students" ).execPopulate();

        const notifiableIds = getNotifiableIds( students );

        const parsedHomework = mapHomeworkByLesson( tomorrowHomework );

        let message = `Задание на завтра\n`;
        botInstance.sendMessage( notifiableIds, message );

        sendHomework( parsedHomework, botInstance, notifiableIds );
    }
}

function getNotifiableIds ( students ) {
    const ids = [];

    for ( const student of students ) {
        if ( student.settings.notificationsEnabled ) {
            const [ hours, mins ] = student.settings.notificationTime
                .match( /([0-9]+):([0-9]+)/ )
                .slice( 1 )
                .map( Number );

            if ( isReadyToNotificate( hours, mins, student.lastHomeworkCheck ) ) {
                ids.push( student.vkId );
                DataBase.changeLastHomeworkCheckDate( student.vkId, new Date() );
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
    let index = 0;

    for ( const [ lesson, homework ] of parsedHomework ) {
        let { homeworkMessage, attachments } = getHomeworkPayload( lesson, homework );

        setTimeout( () => {
            botInstance.sendMessage( notifiableIds, homeworkMessage, attachments )
        }, index++ * 15 );
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

function getTomorrowDate () {
    const tomorrowDate = new Date().getDate() + 1;
    const tomorrowDateInMilliseconds = new Date().setDate( tomorrowDate );
    return new Date( tomorrowDateInMilliseconds );
}

function isToday ( date ) {
    const deltaIsLessThanDay =
        Math.abs( date.getTime() - new Date().getTime() ) <= dayInMilliseconds;
    const datesAreSame = date.getDate() === new Date().getDate();
    return deltaIsLessThanDay && datesAreSame;
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
    filterContentByDate
};
