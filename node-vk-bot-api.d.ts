declare module 'node-vk-bot-api' {
	type ctx = any;

	class Bot {
		constructor(Options: { token: string; group_id: string });
		startPolling() {}
		use(cb: Function): void;
		command(stringOrRegexp: string | RegExp, cb: (context: ctx) => void);
		execute(method: string, options: object);
	}

	export = Bot;
}
