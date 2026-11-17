/**
 * Run Diagnostics is open (from the account menu): the root layout shows `Diagnostics.svelte`
 * while it is. See docs/dev/diagnostics.md.
 */
export const diagnosticsRun: { open: boolean } = $state({ open: false });

export function openDiagnostics(): void {
	diagnosticsRun.open = true;
	if (document.pointerLockElement) document.exitPointerLock();
}

export function closeDiagnostics(): void {
	diagnosticsRun.open = false;
}
