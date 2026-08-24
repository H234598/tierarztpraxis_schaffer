const configuredPort = process.env.PLAYWRIGHT_PORT ?? "4321";
const e2ePort = /^\d{2,5}$/u.test(configuredPort) ? configuredPort : "4321";

export const e2eOrigin = `http://127.0.0.1:${e2ePort}`;
