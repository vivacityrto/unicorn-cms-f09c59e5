/**
 * Ask Viv Response Templates
 * 
 * Copy-paste templates for consistent response formatting.
 */

/**
 * Response templates for each mode
 */
export const RESPONSE_TEMPLATES = {
  compliance: `## Answer
- [Tier 1 status bullet]
- [Tier 2 blocker bullet if applicable]
- [Tier 3 risk bullet if applicable]

## Key records used
- [record label] (table:id) - /path/to/record

## Confidence
**High|Medium|Low**
[Brief explanation of confidence level]

## Gaps
- [Missing data item or "None"]

## Next safe actions
- [Human-actionable step or "None"]`,

  knowledge: `## Answer
- [Procedural guidance bullet]
- [Step or process explanation]

## References
- [Internal doc ID or title, or "None"]

## Confidence
**High|Medium|Low**
[Brief explanation of confidence level]

## Gaps
- [Missing policy or procedure, or "None"]

## Next safe actions
- [Where to find more info or who to contact, or "None"]`,
};

/**
 * Example well-formed compliance response
 */
export const COMPLIANCE_RESPONSE_EXAMPLE = `## Answer
- Current phase: "Assessment Preparation" (status: In Progress)
- 12 incomplete tasks, 3 overdue (mandatory)
- Evidence gap: 2 required document types missing
- Last activity: 2024-01-15

## Key records used
- Package: Health Check 2024 (packages:123) - /clients/456/packages/123
- Phase: Assessment Preparation (documents_stages:789) - /clients/456/packages/123/phases/789

## Confidence
**Medium**
Facts cover the current phase but consult log data is incomplete.

## Gaps
- Consult hours allocation not tracked for this package
- Last consult summary not available

## Next safe actions
- Review 3 overdue tasks in linked phase record
- Request missing evidence types from client contact
- Escalate overdue status to CSC lead if blocking`;

/**
 * Example well-formed knowledge response
 */
export const KNOWLEDGE_RESPONSE_EXAMPLE = `## Answer
- KickStart package scope: initial compliance gap assessment
- Standard duration: 4-6 weeks
- Deliverables: Gap report, action plan, phase 1 document set
- Excludes: ongoing monitoring or audit response

## References
- Vivacity Service Guide v2.3
- KickStart Scope Definition (internal doc)

## Confidence
**High**
Full procedural documentation available for this package type.

## Gaps
- None

## Next safe actions
- Review full scope document for detailed deliverables
- Contact Team Leader for custom scope variations`;
