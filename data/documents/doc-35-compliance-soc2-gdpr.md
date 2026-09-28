# Compliance: SOC 2 & GDPR

This page summarizes Loopwire's compliance posture and what you need to do on your side to meet your own obligations.

## SOC 2 Type II

Loopwire holds a **SOC 2 Type II** report covering the Security, Availability, and Confidentiality trust service criteria. The audit is performed annually by an independent CPA firm, covering a 12-month observation period.

To request the current report, go to **Account Settings > Compliance > Request SOC 2 Report**. The report is shared under NDA, which you accept electronically in the same dialog. Reports are available to Growth and Scale customers; Free-plan accounts can request a summary letter (a bridge letter describing the audit scope and period) but not the full report.

## GDPR

Loopwire acts as a **data processor** for the event payloads you send; you are the **data controller**. Loopwire's Data Processing Agreement (DPA) is published at **loopwire.dev/legal/dpa** and is incorporated into the terms of service for all plans — no separate signature is required. If your legal team needs a countersigned copy, request one from the Compliance page.

The DPA includes:

- The EU Standard Contractual Clauses (SCCs) for transfers of personal data outside the EU.
- A list of sub-processors (cloud hosting, payment processing via Stripe, email delivery).
- Loopwire's commitment to notify you of a personal-data breach without undue delay.

### Sub-processor changes

The current sub-processor list is linked from the DPA. You can subscribe to change notifications on the same page; Loopwire announces new sub-processors at least 30 days before they start processing customer data.

### Data residency

If you need personal data to stay in the EU, create your project in the EU region (Scale plan only). See Data Residency & Regions.

## Encryption

- **In transit**: all API and dashboard traffic requires TLS 1.2 or higher. Loopwire also delivers only to HTTPS subscriber endpoints.
- **At rest**: event payloads, subscriber configuration, and signing secrets are encrypted at rest with AES-256.

## Data retention and deletion

Event payloads are retained for **30 days** on Free and Growth and **90 days** on Scale, then permanently deleted. After that, only delivery metadata (timestamps, status codes, attempt counts) remains; payload contents are not kept.

### Handling data subject requests

Because you are the controller, you are responsible for responding to data subject access and erasure requests. Loopwire provides tools to help:

- **Search**: the dashboard Event Log's payload search (Growth and Scale) finds events whose payload contains a given value, such as an email address. It scans the last 7 days per query; for older events, filter the Event Log by date and event type (see the Event Log & Search guide).
- **Erasure**: `DELETE /v1/events/{eventId}/payload` permanently removes an event's payload before its normal retention expiry. Delivery metadata is kept; the event can no longer be redelivered after its payload is erased (redelivery returns `409 Conflict` with code `payload_erased`).

Deleting a whole project also permanently deletes all of its event payloads.

## Minimizing personal data in payloads

The simplest way to reduce compliance scope is to avoid sending personal data in the first place:

- Send identifiers (e.g. `userId: "usr_123"`) rather than names, emails, or addresses, and let subscribers look up details from your own systems.
- Never put secrets, passwords, or full card numbers in payloads.
- If you must include personal data, keep it to the minimum needed and document it in your records of processing.

## Security questionnaires

Scale customers can request that Loopwire complete custom security questionnaires through their support channel. Growth and Free customers can download Loopwire's standard pre-filled questionnaire (CAIQ Lite) from the Compliance page.

## What Loopwire does not offer

- Loopwire is **not** HIPAA-compliant and does not sign Business Associate Agreements. Do not send protected health information (PHI) through Loopwire.
- Loopwire is **not** PCI DSS certified for storing cardholder data. Do not send full card numbers in payloads.

## Gotchas

- The account audit log (Growth and Scale) is often requested as SOC 2 evidence for access reviews.
- Erasing a payload is irreversible and applies to both live and test environments' copies of that event ID only.
