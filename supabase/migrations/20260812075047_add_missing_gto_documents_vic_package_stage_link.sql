-- Carl spotted a document (id 7563, "GTONS-03-VIC-Performance Review Form")
-- correctly flagged as having real package usage in GovernancePackageAssignments
-- (stage "GTO Documents - VIC" / package "KS-GTO"), yet flagged "No Package"
-- by the new file-status check, which relies on package_stages. Investigated:
-- across the whole system, exactly one stage (id 1115, "GTO Documents - VIC")
-- has real provisioned usage (stage_instances -> package_instances -> KS-GTO,
-- package_id 1034) but was missing from package_stages entirely -- an isolated
-- data-entry gap from when this VIC-specific variant of the base "GTO
-- Documents" stage (id 1082, already correctly in package_stages at
-- sort_order 4) was created, not a systemic package_stages reliability issue.
-- sort_order matches its sibling stage since duplicate sort_order values are
-- allowed (only (package_id, stage_id) is unique).

insert into package_stages (package_id, stage_id, sort_order)
values (1034, 1115, 4);
