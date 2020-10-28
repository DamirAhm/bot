module.exports = {
	PORT: 80,
	ALBUM_ID: process.env.NODE_ENV === 'production' ? '273118190' : '276538163',
	GROUP_ID: process.env.NODE_ENV === 'production' ? '187672009' : '198810996',
	MONGODB_TEST_URI: 'mongodb://localhost:27017/test',
};
