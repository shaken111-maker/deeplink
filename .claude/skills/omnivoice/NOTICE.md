# Vendored skill — provenance

`SKILL.md`, `references/` and `scripts/` in this directory are copied verbatim
from the VoiceStudio project:

- Upstream: https://github.com/debpalash/VoiceStudio
- Path: `.claude/skills/omnivoice/`
- Commit: `f832d616f7eb5ee8028b5c8924249a552638634a`
- Vendored: 2026-09-14

VoiceStudio is licensed **AGPL-3.0-only** (see the upstream `LICENSE` and
`LICENSE-NOTICE.md`). These files carry that license; they are unmodified.

To refresh:

```bash
git clone --depth 1 https://github.com/debpalash/VoiceStudio /tmp/vs
rm -rf .claude/skills/omnivoice/{SKILL.md,references,scripts}
cp -r /tmp/vs/.claude/skills/omnivoice/{SKILL.md,references,scripts} .claude/skills/omnivoice/
```

The skill drives a VoiceStudio backend that you run yourself; nothing in this
repository redistributes VoiceStudio's code or model weights.
