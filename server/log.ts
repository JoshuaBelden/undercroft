function stamp(): string {
	return new Date().toISOString().slice(11, 23);
}

export const log = {
	info: (message: string) => console.log(`[${stamp()}] ${message}`),
	warn: (message: string) => console.warn(`[${stamp()}] WARN ${message}`),
	error: (message: string) => console.error(`[${stamp()}] ERROR ${message}`)
};
