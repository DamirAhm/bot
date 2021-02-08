const ruToEngTranslits = {
	а: 'a',
	б: 'b',
	в: 'v',
	г: 'g',
	д: 'd',
	е: 'e',
	ё: 'yo',
	ж: 'zh',
	з: 'z',
	и: 'i',
	й: 'y',
	к: 'k',
	л: 'l',
	м: 'm',
	н: 'n',
	о: 'o',
	п: 'p',
	р: 'r',
	с: 's',
	т: 't',
	у: 'u',
	ф: 'f',
	х: 'h',
	ц: 'c',
	ч: 'ch',
	ш: 'sh',
	щ: "sh'",
	ъ: '',
	ы: 'i',
	ь: '',
	э: 'e',
	ю: 'yu',
	я: 'ya',
};
const engToRuTranslits = {
	a: 'а',
	b: 'б',
	v: 'в',
	g: 'г',
	d: 'д',
	e: 'е',
	yo: 'ё',
	zh: 'ж',
	z: 'з',
	i: 'и',
	y: 'й',
	k: 'к',
	l: 'л',
	m: 'м',
	n: 'н',
	o: 'о',
	p: 'п',
	r: 'р',
	s: 'с',
	t: 'т',
	u: 'у',
	f: 'ф',
	h: 'х',
	c: 'ц',
	ch: 'ч',
	sh: 'ш',
	"sh'": 'щ',
	oo: 'у',
	ee: 'и',
	yu: 'ю',
	ya: 'я',
};
/**
 * @param {string} rusWord
 */
function translit(rusWord) {
	if (rusWord && typeof rusWord === 'string') {
		return rusWord
			.split('')
			.map((w) => ruToEngTranslits[w.toLowerCase()] || w.toLowerCase())
			.join('');
	} else {
		return '';
	}
}
/**
 * @param {string} engWord
 */
function retranslit(engWord) {
	if (engWord && typeof engWord === 'string') {
		if (/(ch|sh|zh|sh\'|yo|yu|ya|oo|ee).test(engWord)/) {
			for (const i of ['ch', 'sh', 'zh', "sh'", 'yo', 'yu', 'ya', 'oo', 'ee']) {
				engWord = engWord.replace(new RegExp(i, 'g'), engToRuTranslits[i]);
			}
		}
		for (const i of Object.keys(engToRuTranslits)) {
			engWord = engWord.replace(new RegExp(i, 'g'), engToRuTranslits[i]);
		}

		return engWord;
	} else {
		return '';
	}
}

/** @param {string} str */
const capitalize = (str) => (str ? str[0].toUpperCase() + str.slice(1) : '');

module.exports = {
	translit,
	retranslit,
	capitalize,
	engToRuTranslits,
	ruToEngTranslits,
};
