import { describe, expect, it } from 'vitest';
import { destination, gameUrl } from './navigation.ts';

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
