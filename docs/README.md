# Documentation

This directory holds Pixelyph's non-code documentation.

## `features.md`

The full, detailed feature list — the source `README.md`'s "Features"
section summarizes and links back to. Update this first when a feature
changes, then adjust the README's summary if it's now inaccurate.

## `data-model.md`

The core artwork data model (Canvas → Layer → Frame → Grid): exact
shapes, the active-grid selection pointer, the auto grow/shrink and
merge algorithms, and the save-file migration path. Read this before
touching `src/model/` or `src/io/projectFile.js`.

## `session-logs/`

A markdown log for each Claude Code session used to build Pixelyph,
written from the actual session transcripts. Each log covers the goal,
key decisions (with rationale), work completed, and what was deferred.
They're a transparent record of how the project was conceived and
built, and a demonstration of AI-assisted development as a practical
workflow.

## What's Tokenote?

Several session logs reference "Tokenote" notes or resolving a
Tokenote item. Tokenote is a separate companion tool the project's
author uses to jot down ideas, bugs, and refinements while using
Pixelyph, outside of any coding session. Its notes surface to Claude
Code at the start of a session via `.claude/tokenote-notes.md` (not
committed to the repo — local machine state), and finished items get
marked resolved in that file as a session closes them out. It's not
part of Pixelyph itself — just the backlog-capture tool feeding into
these session logs.
