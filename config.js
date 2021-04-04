module.exports = {
	PORT: 80,
	ALBUM_ID: process.env.NODE_ENV === 'development' ? '276538163' : '273118190',
	GROUP_ID: process.env.NODE_ENV === 'development' ? '198810996' : '187672009',
	MONGODB_TEST_URI: 'mongodb://localhost:27017/test',
	isNeedToPickClass: false,
};
