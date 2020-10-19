const fs = require('fs'),
	request = require('superagent');

const download = async function (uri, filename) {
	return await new Promise((resolve, reject) => {
		request(uri)
			.pipe(fs.createWriteStream(filename))
			.on('close', (err) => {
				if (err) reject(err);
				else {
					resolve(filename);
				}
			});
	});
};

module.exports = download;
