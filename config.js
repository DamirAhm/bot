module.exports = {
	PORT: 80,
	TOKEN:
		process.env.NODE_ENV === 'production'
			? '867a9f9c3bb50767bc1521811c14601091072098f189e53293d6704f47a6bc458e0a1d506e8d81df29cba'
			: 'dafeff0085df92ee35c00535a4ab8eb0e908014a9e791652364b836ac5e1b7f31098fd04f76d930ecdb1f',
	MONGODB_URI:
		'mongodb+srv://Damir:CLv4QEJJrfZp4BC0@botdata-sp9px.mongodb.net/prod?retryWrites=true&w=majority',
	REMIND_AFTER: 10800000,
	VK_API_KEY:
		process.env.NODE_ENV === 'production'
			? '196124678b00c85c95903acb2dbd0effecda8e345d7a7c6c887970e6a6f062223bbb9c43ab8c0a22202ce'
			: '0125a7f412043bd3b02b80cc00c202f6d6d7faf1796f22249ac778256dbbd87c0f2f9b3b80fb8ec1f6e02',
	ALBUM_ID: process.env.NODE_ENV === 'production' ? '273118190' : '276538163',
	GROUP_ID: process.env.NODE_ENV === 'production' ? '187672009' : '198810996',
	MONGODB_TEST_URI: 'mongodb://localhost:27017/test',
};
