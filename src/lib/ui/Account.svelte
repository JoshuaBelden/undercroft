<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { ACCOUNT, AVATAR, DISCORD_RESULTS } from '#lib/content/account.ts';
	import {
		ApiError,
		changeGamerTag,
		changePassword,
		deleteAccount,
		disableTwoStep,
		enableTwoStep,
		loadAccount,
		removeAvatar,
		session,
		signOut,
		signOutElsewhere,
		startTwoStep,
		unlinkDiscord,
		uploadAvatar
	} from '#lib/account/account.svelte.ts';
	import Avatar from './Avatar.svelte';
	import AvatarEditor from './AvatarEditor.svelte';
	import TabScreen from './TabScreen.svelte';

	/**
	 * The Account screen (`/account`, from the menu under the gamer tag): who you are, how you sign
	 * in, and two-step sign-in. A TabScreen like Settings. See docs/dev/accounts.md.
	 */
	interface Props {
		onclose: () => void;
		/** The gamer tag or avatar was changed (the game server should read them again). */
		onprofile: () => void;
		/** Offer linking Discord (the Discord application is configured). */
		discord: boolean;
	}

	let { onclose, onprofile, discord }: Props = $props();

	/** Back from linking Discord: what came of it. */
	const notice = DISCORD_RESULTS[page.url.searchParams.get('discord') ?? ''];

	const GROUPS = ['Profile', 'Sign-in', 'Security'] as const;
	// Back from Discord: the group that has it.
	let group = $state<(typeof GROUPS)[number]>(notice ? 'Sign-in' : 'Profile');

	const account = $derived(session.account);
	if (!session.account) void loadAccount();

	/** Turn a refusal into the server's message. */
	const message = (caught: unknown): string =>
		caught instanceof ApiError ? caught.message : 'Could not reach the server';

	// --- Profile
	let gamerTag = $derived(account?.gamerTag ?? '');
	let tagMessage = $state('');

	async function saveTag(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		tagMessage = '';
		try {
			await changeGamerTag(gamerTag);
			tagMessage = 'Saved';
			onprofile();
		} catch (caught) {
			tagMessage = message(caught);
		}
	}

	/** The picture being framed in the crop editor. */
	let framing = $state<File | null>(null);
	let picker = $state<HTMLInputElement>();
	let avatarMessage = $state('');

	function chosen(event: Event & { currentTarget: HTMLInputElement }): void {
		const file = event.currentTarget.files?.[0];
		// The same file can be chosen again next time.
		event.currentTarget.value = '';
		if (!file) return;
		if (file.size > AVATAR.maxSourceBytes) {
			avatarMessage = `That picture is too big (up to ${AVATAR.maxSourceBytes / 1024 / 1024} MB)`;
			return;
		}
		avatarMessage = '';
		framing = file;
	}

	async function saveAvatar(image: Blob): Promise<string | null> {
		try {
			await uploadAvatar(image);
		} catch (caught) {
			return message(caught);
		}
		framing = null;
		avatarMessage = 'Saved';
		onprofile();
		return null;
	}

	async function dropAvatar(): Promise<void> {
		avatarMessage = '';
		try {
			await removeAvatar();
			avatarMessage = 'Removed';
			onprofile();
		} catch (caught) {
			avatarMessage = message(caught);
		}
	}

	const avatarHint = $derived(
		!account
			? ''
			: account.avatarUploaded
				? account.discordAvatar
					? 'Your picture shows instead of your Discord avatar. Remove it to use Discord’s again.'
					: 'The picture other players see beside your gamer tag.'
				: account.discordAvatar
					? 'Your Discord avatar. Upload a picture to use another.'
					: 'Upload a picture for other players to see beside your gamer tag.'
	);

	/** Deleting the account: the confirmation form is open. */
	let deleting = $state(false);
	let confirmTag = $state('');
	let confirmPassword = $state('');
	let confirmCode = $state('');
	let deleteMessage = $state('');

	async function removeAccount(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		deleteMessage = '';
		try {
			await deleteAccount({ gamerTag: confirmTag, password: confirmPassword, code: confirmCode });
		} catch (caught) {
			deleteMessage = message(caught);
		}
	}

	function cancelDelete(): void {
		deleting = false;
		confirmTag = confirmPassword = confirmCode = deleteMessage = '';
	}

	// --- Sign-in
	let current = $state('');
	let password = $state('');
	let again = $state('');
	let passwordMessage = $state('');
	let discordMessage = $state('');

	async function savePassword(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		passwordMessage = '';
		if (password !== again) {
			passwordMessage = "The two new passwords don't match";
			return;
		}
		try {
			await changePassword(current, password);
			current = password = again = '';
			passwordMessage = 'Saved. Any other browser you were signed in on is signed out';
		} catch (caught) {
			passwordMessage = message(caught);
		}
	}

	async function unlink(): Promise<void> {
		discordMessage = '';
		try {
			await unlinkDiscord();
			discordMessage = 'Discord is unlinked';
		} catch (caught) {
			discordMessage = message(caught);
		}
	}

	// --- Security
	/** Turning two-step on: the secret and its QR code, until a code from it is entered. */
	let setup = $state<{ secret: string; qr: string } | null>(null);
	/** Just turned on: the recovery codes, shown this once. */
	let recovery = $state<string[] | null>(null);
	let code = $state('');
	let securityMessage = $state('');
	let copied = $state(false);

	async function beginSetup(): Promise<void> {
		securityMessage = '';
		try {
			setup = await startTwoStep();
		} catch (caught) {
			securityMessage = message(caught);
		}
	}

	async function confirmSetup(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		securityMessage = '';
		try {
			recovery = await enableTwoStep(code);
			setup = null;
			code = '';
		} catch (caught) {
			securityMessage = message(caught);
		}
	}

	async function turnOff(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		securityMessage = '';
		try {
			await disableTwoStep(code);
			code = '';
			securityMessage = 'Two-step sign-in is off';
		} catch (caught) {
			securityMessage = message(caught);
		}
	}

	async function copyCodes(): Promise<void> {
		if (!recovery) return;
		try {
			await navigator.clipboard.writeText(recovery.join('\n'));
			copied = true;
		} catch {
			securityMessage = "Couldn't copy: write them down instead";
		}
	}

	let elsewhereMessage = $state('');

	async function signOutOthers(): Promise<void> {
		try {
			await signOutElsewhere();
			elsewhereMessage = 'Every other browser is signed out';
		} catch (caught) {
			elsewhereMessage = message(caught);
		}
	}
</script>

<TabScreen label="Account" groups={GROUPS} bind:group {onclose}>
	{#if !account}
		<p class="hint">Loading...</p>
	{:else if group === 'Profile'}
		<div class="setting">
			<Avatar src={account.avatar} size={72} />
			<div class="avatar-actions">
				<button type="button" class="pill" onclick={() => picker?.click()}>
					<span class="name">{account.avatarUploaded ? 'Change picture' : 'Upload a picture'}</span>
				</button>
				{#if account.avatarUploaded}
					<button type="button" class="pill" onclick={() => void dropAvatar()}>
						<span class="name">Remove picture</span>
					</button>
				{/if}
			</div>
			<input
				class="picker"
				type="file"
				accept="image/png, image/jpeg, image/webp, image/gif"
				tabindex="-1"
				aria-hidden="true"
				bind:this={picker}
				onchange={chosen}
			/>
			<p class="hint" role="status">{avatarMessage || avatarHint}</p>
		</div>
		{#if framing}
			<AvatarEditor file={framing} onclose={() => (framing = null)} onsave={saveAvatar} />
		{/if}
		<form class="setting" onsubmit={saveTag}>
			<label class="pill">
				<span class="name">Gamer tag</span>
				<input
					type="text"
					minlength={ACCOUNT.tagMin}
					maxlength={ACCOUNT.tagMax}
					required
					autocomplete="off"
					bind:value={gamerTag}
				/>
			</label>
			{#if gamerTag !== account.gamerTag}
				<button type="submit">Save</button>
			{/if}
			<p class="hint" role="status">{tagMessage || 'The name other players see.'}</p>
		</form>
		<div class="setting">
			<div class="pill">
				<span class="name">Email</span>
				<span class="value email">{account.email}</span>
			</div>
			<p class="hint">Where password-reset links are sent.</p>
		</div>
		<div class="setting">
			<button type="button" class="pill" onclick={() => void signOut()}>
				<span class="name">Sign out</span>
			</button>
		</div>
		{#if deleting}
			<form class="stack" onsubmit={removeAccount}>
				<p class="hint">
					This deletes your account for good: your explorer, everything in your stash, your coins
					and your friends list. It can't be undone. Bug reports, ideas and feedback you sent stay,
					without your name.
				</p>
				<label class="pill">
					<span class="name">Type your gamer tag</span>
					<input type="text" autocomplete="off" required bind:value={confirmTag} />
				</label>
				{#if account.hasPassword}
					<label class="pill">
						<span class="name">Password</span>
						<input
							type="password"
							autocomplete="current-password"
							required
							bind:value={confirmPassword}
						/>
					</label>
				{/if}
				{#if account.mfa}
					<label class="pill">
						<span class="name">Two-step code</span>
						<input type="text" autocomplete="one-time-code" required bind:value={confirmCode} />
					</label>
				{/if}
				<div class="setting">
					<button type="submit" class="pill danger">
						<span class="name">Delete my account</span>
					</button>
					<button type="button" class="pill" onclick={cancelDelete}>
						<span class="name">Cancel</span>
					</button>
				</div>
				{#if deleteMessage}
					<p class="hint error" role="alert">{deleteMessage}</p>
				{/if}
			</form>
		{:else}
			<div class="setting">
				<button type="button" class="pill" onclick={() => (deleting = true)}>
					<span class="name">Delete account</span>
				</button>
				<p class="hint">Remove your account and everything on it, for good.</p>
			</div>
		{/if}
	{:else if group === 'Sign-in'}
		<form class="stack" onsubmit={savePassword}>
			{#if account.hasPassword}
				<label class="pill">
					<span class="name">Current password</span>
					<input type="password" autocomplete="current-password" required bind:value={current} />
				</label>
			{/if}
			<label class="pill">
				<span class="name">{account.hasPassword ? 'New password' : 'Password'}</span>
				<input
					type="password"
					autocomplete="new-password"
					minlength={ACCOUNT.passwordMin}
					required
					bind:value={password}
				/>
			</label>
			<label class="pill">
				<span class="name">Again</span>
				<input
					type="password"
					autocomplete="new-password"
					minlength={ACCOUNT.passwordMin}
					required
					bind:value={again}
				/>
			</label>
			<div class="setting">
				<button type="submit" class="pill">
					<span class="name">{account.hasPassword ? 'Change password' : 'Set a password'}</span>
				</button>
				<p class="hint" role="status">
					{passwordMessage ||
						(account.hasPassword
							? `At least ${ACCOUNT.passwordMin} characters.`
							: 'You sign in with Discord. A password lets you sign in with your email too.')}
				</p>
			</div>
		</form>

		{#if discord || account.discord}
			<div class="setting">
				{#if account.discord}
					<button type="button" class="pill" onclick={() => void unlink()}>
						<span class="name">Unlink Discord</span>
						<span class="value">{account.discord}</span>
					</button>
				{:else}
					<a class="pill" href={resolve('/auth/discord/link')} data-sveltekit-reload>
						<span class="name">Link Discord</span>
					</a>
				{/if}
				<p class="hint" role="status" class:error={notice?.error && !discordMessage}>
					{discordMessage ||
						notice?.message ||
						(account.discord
							? 'You can sign in with Discord.'
							: 'Sign in with your Discord account as well as your email.')}
				</p>
			</div>
		{/if}
	{:else if group === 'Security'}
		{#if recovery}
			<div class="stack">
				<p class="hint">
					Two-step sign-in is on. These recovery codes get you in if you lose your phone: each works
					once. Keep them somewhere safe. They won't be shown again.
				</p>
				<ol class="codes">
					{#each recovery as each (each)}
						<li><code>{each}</code></li>
					{/each}
				</ol>
				<div class="setting">
					<button type="button" class="pill" onclick={() => void copyCodes()}>
						<span class="name">{copied ? 'Copied' : 'Copy the codes'}</span>
					</button>
					<button type="button" class="pill" onclick={() => (recovery = null)}>
						<span class="name">I've saved them</span>
					</button>
				</div>
			</div>
		{:else if setup}
			<form class="stack" onsubmit={confirmSetup}>
				<p class="hint">
					Scan this with an authenticator app (Google Authenticator, Microsoft Authenticator,
					1Password, Authy...), then enter the code it shows.
				</p>
				<img
					class="qr"
					src="data:image/svg+xml;utf8,{encodeURIComponent(setup.qr)}"
					alt="QR code for your authenticator app"
					width="200"
					height="200"
				/>
				<p class="hint">Can't scan it? Enter this key instead: <code>{setup.secret}</code></p>
				<label class="pill">
					<span class="name">Code</span>
					<input
						type="text"
						inputmode="numeric"
						autocomplete="one-time-code"
						required
						bind:value={code}
					/>
				</label>
				<div class="setting">
					<button type="submit" class="pill"><span class="name">Turn on</span></button>
					<button type="button" class="pill" onclick={() => (setup = null)}>
						<span class="name">Cancel</span>
					</button>
				</div>
				{#if securityMessage}
					<p class="hint error" role="alert">{securityMessage}</p>
				{/if}
			</form>
		{:else if account.mfa}
			<form class="stack" onsubmit={turnOff}>
				<p class="hint">
					Two-step sign-in is on: signing in asks for a code from your authenticator app.
					{account.recoveryCodesLeft} recovery
					{account.recoveryCodesLeft === 1 ? 'code' : 'codes'} left.
				</p>
				<label class="pill">
					<span class="name">Code</span>
					<input type="text" autocomplete="one-time-code" required bind:value={code} />
				</label>
				<div class="setting">
					<button type="submit" class="pill"><span class="name">Turn off</span></button>
					<p class="hint" role="status">
						{securityMessage || 'A code from your app, or a recovery code.'}
					</p>
				</div>
			</form>
		{:else}
			<div class="setting">
				<button type="button" class="pill" onclick={() => void beginSetup()}>
					<span class="name">Turn on two-step sign-in</span>
				</button>
				<p class="hint" role="status">
					{securityMessage ||
						'Signing in will also ask for a code from an app on your phone, so a stolen password is not enough.'}
				</p>
			</div>
		{/if}

		<div class="setting">
			<button type="button" class="pill" onclick={() => void signOutOthers()}>
				<span class="name">Sign out everywhere else</span>
			</button>
			<p class="hint" role="status">
				{elsewhereMessage || 'Every other browser signed in to this account. This one stays.'}
			</p>
		</div>
	{/if}
</TabScreen>

<style>
	.stack {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.pill input[type='password'],
	.pill input[inputmode],
	.pill input[autocomplete='one-time-code'] {
		flex: 1;
		min-width: 0;
		padding: 0;
		border: none;
		outline: none;
		background: transparent;
		color: var(--text);
		font-size: inherit;
		text-align: right;
	}

	.avatar-actions {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	/* Opened from the Upload button: the browser's own file control isn't shown. */
	.picker {
		display: none;
	}

	a.pill {
		color: var(--text);
		text-decoration: none;
	}

	.email {
		overflow: hidden;
		text-overflow: ellipsis;
		text-transform: none;
	}

	.error,
	.danger .name {
		color: #ff9a70;
	}

	.qr {
		align-self: flex-start;
		padding: 8px;
		background: #fff;
	}

	.codes {
		display: grid;
		grid-template-columns: repeat(2, max-content);
		gap: 6px 32px;
		margin: 0;
		padding: 0 0 0 20px;
	}

	.codes code {
		font-size: 1rem;
	}
</style>
