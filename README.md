# Mozzarts

```
Memebers: Will Sarmiento, David Hochberg, Jayden Elishaw, Arteen Ramezani, Khoa Vo, Kieran Moynihan
```

NOTE: Some issues with slash commands on discord app, so a possible fix is the use of testing in the web browser for [discord](https://discord.com/)!

## This is the current state of the project

Memebers need to fork this project and then clone this Repo to start!

### Brainstorming:

We thought of a couple of ideas such as:

```
Gambling bot (Blackjack, Complex slots, Roullette, Poker)
Trivia bot (Music, Common Knowledge, Movies/Shows)
Game bot (Wordle, Uno/Card Games, Connect 4)
```

These are only a few but so far we are leaning towards a mix of the game/gambling bot!

### Chosen Bot:

We have chosen the:

```
Music trivia bot!
```

Now We are in the part of finding our requirements and functions!

Requirements:

1. Trivia of selected genres of music
2. Points
3. Leaderboard


> # Version 1.0
### Arteen Ramezani - Release Notes:

```
- Added the bot trivia command:
  - When called the bot shows a preview which will contain a description and
    difficulties to pick from. Underneath the preview there are interactable
    buttons with difficulties the user can choose from which for now just displays
    music questions with multiple choice answers also as buttons. If the answer
    is correct, based on respective difficulty, the bot will "give" 1, 2, or 3 points
    to the user (tracking the points is a work in progress). If wrong, gives no points.
    Additionally after the user picks an answer, there is a display for Correct or
    Wrong which also shows the Question, Correct Answer, User's Answer, and
    the name of the question was answered by.
```
> # Version 1.02
---
### Jayden Elishaw - Release Notes:

#### Primary added features
- Added logging for all implemented features
- `/trivia` command now handles song previews, guessing, and multiple-choice questions tied to the currently playing iTunes track.  The old `/game` command has been removed.
- Logs to terminal for debugging voice/HTTP/command execution

##### Pre-Build commands (new)
-Run these once to set up environment (installs new discordJS version and FFMPEG)
```
sudo apt-get update
sudo apt-get install -y ffmpeg
npm i discord.js@^14
npm i -D @discordjs/rest discord-api-types
```

##### Build commands (new)
- Source files live under `src/`
- `npm run build` runs esbuild:
  - Bundles/transpiles JS
  - Outputs CommonJS modules into `build/`
  - Preserves folder structure via `--outbase=src`

##### Runtime commands (same)
- `npm start` runs:
  1) build
  2) `node -r dotenv/config build/app.js`
---

> # Version 1.0.3
> ### Will Sarmiento - Release Notes
### Added:
```
- Explanation of the rules
```

> # Version 1.0.4
> ### Khoa Vo - Release Notes
### Added:
```
- Basic genre feature that allows user to select the genre of the song
```

> # Version 1.0.5
> ### Kieran Moynihan - Release Notes
### Added:
```
- Added a score tracker and a command to see the current score
```

> # Version 2.0.0
### ArteenR Changes:
```
- Enforced 15‑second answer window after each preview; unanswered rounds end
  automatically.
- Tested skip functionality but chose to remove.
- Added hint feature, needs to still be cleaned up.
- Modified replay button; limited to one use per song and restarts the timer.
- Added a hint button (one use per round) that does not affect the timer.
- After each round ends there is a 5‑second pause before the next preview begins.
- Difficulty selection descriptions updated to match question types:
  easy=artist/genre, medium=album/title, hard=year.
- Fixed crash caused by overly long button IDs by using numeric indices.
- Questions are all relevant to the song being played
- Ensured a round only moves on after the previous round is over
- Cleaned up Gameplay loop
```

> # Version 2.0.1
> ### Maintenance update
### ArteenR Changes:
```
- Multiple-choice questions now strictly respect the selected difficulty;
  easy rounds only ask about artist/genre, medium about album/title, hard
  about release year.  This prevents irrelevant answer options.
- Hints are generated based on the actual question type instead of always
  showing artist/title initials; the API now supports `track`,`artist`,`genre`,
  `album`, and `year` hints.
- Added `/terminate` slash command (admin only) which immediately ends a
  running trivia game and announces the termination to the channel.
- Added tests covering the new hint logic, and difficulty constraints.
- Updated normalization utility used in tests to collapse extra whitespace.
```
### Jayden Changes:
```
- /terminate now requires admin permission + stops timers/collectors instantly
- Added a full regression suite
(Details in v2.0.1 release)
```
### David Hochberg Changes:
```
- Added tracking of player stats including rounds played/won and games played/won
  - Players can use /stats to check their stats
  - Admins can use /getstats <user> to check that user's stats
- Changed the name of the /getscore command to /leaderboard
- The new /getscore is now an admin command to get the score of any player
```
### Will Sarmiento Changes:
```
- Added a powerup double points
- Documented the trivia.js file
- Removed outdated functions and files

```
### Khoa Vo Changes:
```
- Created a powerup file and added the first powerup to freeze time
- Added a visual timer to display the time remaining
- Created the replay button to replay the song

```
Version 2.0.4
Kieran Moynihan Changes:
- Added `/gameinfo` command to display active trivia session state (host, difficulty, round, channels).
- Added `/activeplayers` command to display ranked players during an active trivia session.
- Refactored `/score` to support user selection and correct guild-scoped score lookup.


# Version 2.1 Release Notes

## Will Sarmiento
 - Rules are more clear and detailed (#110 by @willnh7) 
 - Hint point deduction (#116 by @willnh7)
 - Randomizing the powerup rewarding, user can no longer get a powerup immediately (#88 by @willnh7)

## Khoa Vo
 - Skip preview of the song (#114 by @khoav22)
 - Less time to listen to replay based on difficulty (#109 by @khoav22)

## Arteen Ramezani
 Changes in this version code architecture by @rt-op in https://github.com/CSS360-2026-Winter/Mozzarts/issues/54:
    - Broke down the 600+ line execute function into 18 smaller, focused functions
    - Added comprehensive JSDoc documentation for all functions with parameter types and descriptions
    - Improved code readability with detailed inline comments explaining game flow phases
    - Enhanced error handling and resource cleanup
    - Preserved all existing bot functionality and user experience
    - Fixed test suite issues and import/export mismatches
    - Created missing powerup command that was referenced in tests
    - Modularized game phases: difficulty selection, channel validation, voice setup, game loop, scoring, cleanup
    - Better separation of concerns between UI, game logic, and data management


