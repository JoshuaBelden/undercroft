/**
 * Uploads the built desktop app (desktop/release/win-unpacked) to Steam with SteamPipe. Nothing
 * is uploaded unless --upload is given: without it this only writes the build script and prints
 * the command it would run. Even with it, the build is not set live: that is done by hand on the
 * Steamworks partner site. See docs/dev/desktop.md#uploading-to-steam.
 *
 *   pnpm -C desktop dist                # build desktop/release/win-unpacked first
 *   pnpm steam:upload                   # write the build script, show the command
 *   pnpm steam:upload --upload          # run it with steamcmd
 *
 * From the environment (none are set anywhere in this repository):
 *   STEAM_APP_ID     the game's app id (not 480: Valve's test app can't be uploaded to)
 *   STEAM_DEPOT_ID   its Windows depot
 *   STEAM_BUILDER    the Steam account that uploads (a build account, with Steam Guard)
 *   STEAMCMD         path to steamcmd (default: steamcmd on the PATH)
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
	options: {
		upload: { type: 'boolean', default: false },
		description: { type: 'string' }
	}
});

const root = path.resolve(import.meta.dirname, '../..');
const content = path.join(root, 'desktop/release/win-unpacked');
const output = path.join(root, 'desktop/release/steam');

const fail = (message: string): never => {
	console.error(message);
	process.exit(1);
};

const appId = process.env.STEAM_APP_ID ?? '';
const depotId = process.env.STEAM_DEPOT_ID ?? '';
const builder = process.env.STEAM_BUILDER ?? '';
if (!/^\d+$/.test(appId) || !/^\d+$/.test(depotId) || !builder) {
	fail('Set STEAM_APP_ID, STEAM_DEPOT_ID and STEAM_BUILDER first (docs/dev/desktop.md).');
}
if (appId === '480') fail("480 is Valve's test app: uploads need the game's own app id.");
if (!/^[\w.-]+$/.test(builder)) fail('STEAM_BUILDER must be a Steam account name.');
if (!existsSync(path.join(content, 'Undercroft.exe'))) {
	fail(`No build at ${content}. Run pnpm -C desktop dist first.`);
}

const version = (
	JSON.parse(readFileSync(path.join(root, 'desktop/package.json'), 'utf8')) as {
		version: string;
	}
).version;
const description = (args.description ?? `Undercroft ${version}`).replace(/["\\\r\n]/g, '');
const template = readFileSync(path.join(import.meta.dirname, 'app_build.vdf.template'), 'utf8');
const script = template
	.replaceAll('{{APP_ID}}', appId)
	.replaceAll('{{DEPOT_ID}}', depotId)
	.replaceAll('{{DESCRIPTION}}', description)
	.replaceAll('{{CONTENT_ROOT}}', content.replaceAll('\\', '/'))
	.replaceAll('{{BUILD_OUTPUT}}', path.join(output, 'output').replaceAll('\\', '/'));

mkdirSync(path.join(output, 'output'), { recursive: true });
const scriptPath = path.join(output, `app_build_${appId}.vdf`);
writeFileSync(scriptPath, script);

const steamcmd = process.env.STEAMCMD || 'steamcmd';
const command = ['+login', builder, '+run_app_build', scriptPath, '+quit'];
console.log(`Build script: ${scriptPath}`);
if (!args.upload) {
	console.log(`Not uploading. To upload, run again with --upload. It would run:`);
	console.log(`  ${steamcmd} ${command.join(' ')}`);
	process.exit(0);
}
// steamcmd asks for the password and Steam Guard code itself.
execFileSync(steamcmd, command, { stdio: 'inherit' });
console.log('Uploaded. Set it live on a branch from the Steamworks partner site.');
