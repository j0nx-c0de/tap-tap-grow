---
description: Read the roadmap, pick the next unblocked item, and start it.
---

Use the `roadmap` agent to establish the current position. Then:

- State the next unblocked item in one line, name the files it touches, and **stop for my
  go-ahead before writing any code.**
- Separate what this codebase can do from what needs me at a Twilio or Resend console. Do
  not plan around a manual step; name it and stop.
- Before writing Next.js code, read the relevant guide under `node_modules/next/dist/docs/`
  as `AGENTS.md` requires. The APIs here differ from training data.
- When the change lands, add a `CHANGELOG.md` entry at the **bottom** — this file runs
  oldest to newest — and say why, not just what.
