module.exports = {
	PORT: 80,
	TOKEN:
		process.env.NODE_ENV === 'production'
			? 'e5100c829eadf1102b0ecafcc47e0ca90f16f8b3f8c7193dc3899be1d7f0f7a938437bfcb8f79bd6f982b'
			: 'afbf1bd6e9f1f7cf32ac555be672f3936ccabe5a1a78a148f5a6b9e1a2b5993b9e20fb2aed389ea2d7d7d',
	MONGODB_URI:
		'mongodb+srv://Damir:CLv4QEJJrfZp4BC0@botdata-sp9px.mongodb.net/prod?retryWrites=true&w=majority',
	REMIND_AFTER: 10800000,
	VK_API_KEY: 'eef7c13feef7c13feef7c13f2aee84a0dceeef7eef7c13fb1d95fef2a92c7da17fff916',
	ALBUM_ID: process.env.NODE_ENV === 'production' ? '273118190' : '276538163',
	GROUP_ID: process.env.NODE_ENV === 'production' ? '187672009' : '198810996',
	MONGODB_TEST_URI: 'mongodb://localhost:27017/test',
};
