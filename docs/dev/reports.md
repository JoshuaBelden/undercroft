# Bug reports, crashes, ideas and feedback

How players tell us things, and where it goes:

- **Bug reports** are kept in MongoDB and filed as GitHub issues by the server. Players need no GitHub account.
- **Crashes**: when something breaks, the player is asked whether to send a report about it, with the error attached. Nothing is sent unless they choose to. Server errors are also recorded on their own, for the admin app.
- **Ideas** go on a public board once an admin has approved them; players vote for the ones they want.
- **Feedback** is private: only the admin app shows it.

The admin app's side of all this is in [admin.md](admin.md).

## Files

| File                                         | What                                                                  |
| -------------------------------------------- | --------------------------------------------------------------------- |
| `src/lib/content/reports.ts`                 | Lengths, labels, ignored errors, idea statuses                        |
| `src/lib/shared/reports.ts`                  | `Diagnostics`, `CrashInfo`, `ReportInput`, `IdeaView`                 |
| `src/lib/server/store/reports.ts`            | `reports` and `errors`: keeping, grouping by fingerprint, listing     |
| `src/lib/server/store/feedback.ts`           | `ideas`, `ideaVotes`, `feedback`                                      |
| `src/lib/server/github.ts`                   | Filing on GitHub: issues, comments, what goes in them                 |
| `src/lib/game/diagnostics.ts`                | What a report carries: version, browser, GPU, the game, the console   |
| `src/lib/game/crash.svelte.ts`               | The crash prompt and the bug report form's state; watching for errors |
| `src/hooks.client.ts`                        | Starts the console capture and the crash watch; `handleError`         |
| `src/hooks.server.ts`                        | `handleError`: records site errors, gives the error page their id     |
| `src/lib/ui/BugReport.svelte`                | The form                                                              |
| `src/lib/ui/CrashDialog.svelte`              | "Something went wrong. Report it?"                                    |
| `src/routes/(hub)/feedback/`                 | Ideas and feedback                                                    |
| `src/routes/api/report`, `ideas`, `feedback` | The endpoints                                                         |
| `server/errors.ts`                           | Game server errors: logged, recorded, told to the players they hit    |

## Bug reports

**Report a bug** is in the account menu, on the settings screen (so underground too), on the Ideas and feedback page, and behind the crash prompt. They all call `openBugReport(crash?)`; the root layout shows the form (`BugReport.svelte`) while `bugReport.open`.

The form asks for a title, what happened and how to make it happen. Under it, **Send details about the game and this computer** (on by default) lists everything that goes with it, gathered when the form opened (`collectDiagnostics`):

- the version, the browser, the GPU (WebGL's renderer name), the window size;
- the page;
- underground (the play page's `setGameContext`): solo or co-op, the map seed, the room, the F3 numbers and the round trip;
- the last 50 console warnings and errors (`captureConsole` keeps them from the start).

Never the email, gamer tag or password.

`POST /api/report` checks it (`cleanReport`: every field trimmed and capped), counts it against the `report` limit (6 an hour per account), keeps it (`createReport`), then files it (`fileReport`) and answers `{ id, issue }`.

### Filing on GitHub

`github.ts` posts to the GitHub REST API with `GITHUB_TOKEN`: make it a **fine-grained token with Issues read and write on this one repository only**. `GITHUB_REPO` is `owner/name`.

- The issue has the title, the player's words quoted, the error if there is one, and the details in a closed `<details>` block, labelled `bug` and `from-game`.
- **Nothing that says who sent it goes on GitHub**: only the report id at the bottom, which the admin app maps back to the player. So the repository can be public.
- A player's `@` is broken with a zero-width space, so a report can't mention (and notify) anyone.
- A report about a crash that already has an issue becomes a comment on that issue instead of a new one.
- Without a token (development) the report stays `pending` and is written to the log. If GitHub refuses or times out (10 s), it is `failed` with the reason; the admin app's Bug reports page can file it again.

## Crashes

An error nobody caught becomes a `CrashInfo` (`source`, `message`, `stack`, maybe `errorId`) and goes to `promptCrash`, which shows `CrashDialog`. The player chooses **Report it** (the form opens with the error attached) or **Not now**.

- **In the browser**: `window` `error` and `unhandledrejection`, and SvelteKit's `handleError` for `unknown` errors (not a 404, not an `error()`). Only errors from our own scripts (by file or stack origin): an extension's errors aren't ours. Messages starting with one of `IGNORED_ERRORS` (network drops, `ResizeObserver` notices) never ask.
- **On the site's server**: `handleError` in `hooks.server.ts` records the error in `errors` (source `web`) and puts its id on `App.Error`. `+error.svelte` offers **Report it**, which attaches that id.
- **On the game server**: a message handler (`server/connection.ts`) or an expedition tick (`Session.safeStep`) that throws is caught: the error is logged and recorded (`serverCrash`, source `game`, at most once a minute per error), and the players it hit get `serverError { id, message }`, once per error per expedition, which prompts. A tick that throws doesn't stop the expedition: the next one runs. An uncaught exception anywhere else is recorded and the process exits, for Docker to start it again.

Each error asks once per page load. To try it: the F10 admin panel's Session group has **Throw a server error** and **Throw a client error** (dev mode).

### Grouping

`errors` holds one document per **fingerprint**: the source, the message with numbers and ids replaced, and the top stack frame without line numbers or build hashes (`fingerprint`). Each has a count, when it was first and last seen, the versions, how many reports are about it, and its GitHub issue once filed. Server errors are counted whether or not anyone reports them; a browser error only arrives with a player's report. The admin app's Crashes page lists them and can file one on GitHub (`fileCrash`, labels `bug` and `crash`).

## Ideas

`/feedback` in the hub (Ideas and feedback, from the account menu) shows the board: approved ideas, most votes first, filtered by status (Open, Planned, In progress, Done, All), and the player's own ideas still waiting.

- **Suggesting** (`POST /api/ideas`, 5 an hour): a title and a description. It starts `pending`, with its author's vote on it, and only its author sees it until an admin approves it.
- **Voting** (`POST` / `DELETE /api/ideas/<id>/vote`): one vote per player per idea (`ideaVotes`, `_id` is `<idea>:<account>`), and it can be taken back. Only `open`, `planned` and `inProgress` ideas take votes. The count on the idea (`votes`) changes only when a vote document is really added or removed, so it can't drift.
- **Statuses** (`IDEA_STATUSES`): `pending`, `open`, `planned`, `inProgress`, `done`, `declined`, `merged`. `pending` and `merged` are never on the public board.
- **In the admin app**: approve (tidying the wording first), decline (with a note), set the status, the note players see under the idea, a GitHub issue link; and merge a duplicate into another idea: its voters vote for that one, once each, and it leaves the board (`mergeIdea`).

Players see who suggested an idea only if it is theirs ("Yours").

## Feedback

A box on the same page (`POST /api/feedback`, 6 an hour): free text, kept with the gamer tag and the version. Only the admin app reads it, as an inbox: mark read or unread, archive.

## Limits and lengths

All in `src/lib/content/reports.ts` (`REPORT`, `IDEA`, `FEEDBACK`) and the `report`, `idea`, `feedback` and `vote` rules of `THROTTLE` (`src/lib/content/account.ts`). The forms use the same numbers as the server.
