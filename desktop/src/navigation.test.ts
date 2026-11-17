import { describe, expect, it } from 'vitest';
import { destination, gameUrl, hostedSite, protocolTarget } from './navigation.ts';

const GAME = 'https://undercroft.us';

describe('destination', () => {
	it('keeps the game in the window', () => {
		expect(destination(GAME, 'https://undercroft.us/play')).toBe('window');
		expect(destination(GAME, 'https://undercroft.us/auth/discord/callback?code=x')).toBe('window');
	});

	it('keeps the Discord sign-in round trip in the window', () => {
		expect(destination(GAME, 'https://discord.com/oauth2/authorize?client_id=1')).toBe('window');
		expect(destination(GAME, 'https://discord.com/login?redirect_to=%2Foauth2')).toBe('window');
	});

	it('sends other web links to the system browser', () => {
		expect(destination(GAME, 'https://github.com/JoshuaBelden/undercroft')).toBe('browser');
		expect(destination(GAME, 'https://discord.com/channels/1')).toBe('browser');
		expect(destination(GAME, 'http://example.com')).toBe('browser');
	});

	it('does not treat a look-alike host as the game', () => {
		expect(destination(GAME, 'https://undercroft.us.example.com/')).toBe('browser');
		expect(destination(GAME, 'http://undercroft.us/')).toBe('browser');
	});

	it('blocks anything that is not a web link', () => {
		expect(destination(GAME, 'file:///C:/Windows/System32')).toBe('blocked');
		expect(destination(GAME, 'javascript:alert(1)')).toBe('blocked');
		expect(destination(GAME, 'steam://run/480')).toBe('blocked');
		expect(destination(GAME, 'not a url')).toBe('blocked');
	});

	it('works against a local dev client', () => {
		expect(destination('http://localhost:5173', 'http://localhost:5173/play')).toBe('window');
		expect(destination('http://localhost:5173', 'http://localhost:8787')).toBe('browser');
	});
});

describe('gameUrl', () => {
	it('uses the override when it is a URL, else the live site', () => {
		expect(gameUrl('http://localhost:5173', GAME).origin).toBe('http://localhost:5173');
		expect(gameUrl(undefined, GAME).origin).toBe(GAME);
		expect(gameUrl('', GAME).origin).toBe(GAME);
		expect(gameUrl('nonsense', GAME).origin).toBe(GAME);
	});
});

describe('hostedSite', () => {
	it('runs the game locally unless told otherwise', () => {
		expect(hostedSite(undefined, GAME, false)).toBeNull();
		expect(hostedSite('', GAME, false)).toBeNull();
	});

	it('shows the built-in site in a hosted build', () => {
		expect(hostedSite(undefined, GAME, true)?.origin).toBe(GAME);
	});

	it('lets UNDERCROFT_URL win in either build', () => {
		expect(hostedSite('http://localhost:5173', GAME, false)?.origin).toBe('http://localhost:5173');
		expect(hostedSite('http://localhost:5173', GAME, true)?.origin).toBe('http://localhost:5173');
	});
});

describe('protocolTarget', () => {
	const game = new URL(GAME);
	const target = (link: string) => protocolTarget(['Undercroft.exe', link], game)?.href ?? null;

	it('opens the page a link asks for, on the game', () => {
		expect(target('undercroft://about/changes')).toBe('https://undercroft.us/about/changes');
		expect(target('undercroft://play/')).toBe('https://undercroft.us/play/');
		expect(target('undercroft://social?tab=party')).toBe('https://undercroft.us/social?tab=party');
	});

	it('leaves the window alone for a bare link, or none', () => {
		expect(target('undercroft://')).toBeNull();
		expect(target('undercroft:')).toBeNull();
		expect(protocolTarget(['Undercroft.exe', '--dev'], game)).toBeNull();
	});

	it('finds the link among other arguments', () => {
		const argv = ['Undercroft.exe', '--allow-file-access-from-files', 'UNDERCROFT://account'];
		expect(protocolTarget(argv, game)?.href).toBe('https://undercroft.us/account');
	});

	it('never leaves the game', () => {
		expect(target('undercroft:////evil.example/x')).toBe('https://undercroft.us/evil.example/x');
		expect(target('undercroft:/\\evil.example/x')).toBe('https://undercroft.us/evil.example/x');
		expect(target('undercroft://@evil.example/x')).not.toMatch(/^https:\/\/evil/);
	});
});
