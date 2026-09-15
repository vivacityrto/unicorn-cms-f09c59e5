# Publish current project

## Goal
Publish the current state of the project to its public URL.

## Steps
1. Run `security--get_scan_results` to check for unresolved critical security findings.
2. If critical findings exist, surface them and ask whether to address them first.
3. Call `preview_ui--publish` to deploy the current project.
4. Report the expected live URL and any reminders from the publish result.

## Notes
- Publishing is a deployment action; this plan exits plan mode to execute it.
- Per the publishing workflow, a security scan check is required before publishing.
