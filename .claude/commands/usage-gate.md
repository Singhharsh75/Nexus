# Usage Gate — Check before proceeding

Before starting the next sub-task, STOP and do the following:

1. Tell me: "Ready to start [next sub-section name]. Please run /usage and tell me your current usage percentage."
2. WAIT for my response. Do NOT proceed until I reply.
3. If I say usage is BELOW 90%: proceed with the sub-task.
4. If I say usage is AT or ABOVE 90%: immediately do the following:
   a. Save current progress to `STATUS.md` with:
      - Current phase and sub-section completed
      - List of files created or modified so far
      - What remains to be done in this phase
      - Any known issues or bugs
      - Test status (what passes, what's pending)
   b. Stage and commit all work: `git add -A && git commit -m "WIP: Phase [N] — [last completed sub-section]"`
   c. Tell me: "Session paused at [X]% usage. Progress saved to STATUS.md and committed. Start a fresh session and say: 'Read CLAUDE.md, SPEC.md, and STATUS.md. Resume from where we left off.'"
   d. STOP. Do not write any more code.

IMPORTANT: Run this check BETWEEN every sub-section (e.g., between 1.1 and 1.2, between 1.2 and 1.3). Never skip it.
