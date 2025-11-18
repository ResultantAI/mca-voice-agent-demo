# Voice Agent Scenario Library - Schema Documentation

**Version:** 1.0.0
**Platform:** Retell API
**Integration:** Make.com → HubSpot + Notion
**Goal:** Reduce voice agent build time from 4 hours → 90 minutes

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Schema Overview](#schema-overview)
3. [Node Types Explained](#node-types-explained)
4. [Edge Types & Flow Control](#edge-types--flow-control)
5. [Variable Types & Validation](#variable-types--validation)
6. [Variable Substitution](#variable-substitution)
7. [Make.com Integration](#makecom-integration)
8. [HubSpot Field Mapping](#hubspot-field-mapping)
9. [Cost Model](#cost-model)
10. [Building Your Own Scenarios](#building-your-own-scenarios)
11. [Testing & Validation](#testing--validation)

---

## Quick Start

### Files in this Library

```
voice-agent-scenarios/
├── schema.json                 # Formal schema definition
├── inbound_qualifier.json      # Premier MCA demo template
├── outbound_prospecting.json   # (Coming soon)
├── appointment_setter.json     # (Coming soon)
└── VOICE_AGENT_SCHEMA_README.md       # This file
```

### Using a Template

1. **Copy the template** (e.g., `inbound_qualifier.json`)
2. **Customize prompts** - Replace {{variables}} with your own questions
3. **Update config** - Add your Retell Agent ID and Make.com webhook URL
4. **Deploy to Retell** - Upload via Retell API or dashboard
5. **Test** - Make a test call and verify data flows to Make.com

---

## Schema Overview

The schema uses a **state machine model** for call flows:

```
[Entry Node] → [Question] → [Question] → [Branch] → [Outcome]
                    ↓           ↓            ↓
                [Variables] [Variables]  [Conditions]
```

### Core Concepts

| Concept | Description | Example |
|---------|-------------|---------|
| **Node** | A state in the call flow | "greeting", "ask_loan_amount", "qualified_outcome" |
| **Edge** | A transition between nodes | "If loan_amount > $10K, go to qualified" |
| **Variable** | Data collected during call | contact_name, monthly_revenue, urgency |
| **Condition** | Logic for branching decisions | monthly_revenue >= 15000 AND business_age >= 6 |
| **Prompt** | What the AI says at each node | "Thank you for calling Premier MCA..." |

---

## Node Types Explained

### 1. `greeting` - Initial Greeting

**Purpose:** First thing caller hears when call connects

**Example:**
```json
{
  "id": "greeting",
  "type": "greeting",
  "prompt": "Thank you for calling Premier MCA. My name is Sarah, and I'm here to help you explore funding options for your business. May I start by getting your name?",
  "variable": {
    "name": "contact_name",
    "type": "string"
  },
  "edges": [
    {"type": "default", "target": "ask_business_name"}
  ]
}
```

**Best Practices:**
- Keep under 15 seconds
- Introduce AI agent by name
- Ask for first piece of information (usually name)
- Set friendly, professional tone

---

### 2. `question` - Ask & Collect Data

**Purpose:** Asks a question and collects a variable

**Example:**
```json
{
  "id": "ask_loan_amount",
  "type": "question",
  "prompt": "How much funding is your business looking for today?",
  "variable": {
    "name": "loan_amount",
    "type": "currency",
    "validation": {
      "required": true,
      "min": 5000,
      "max": 500000
    }
  },
  "edges": [
    {"type": "default", "target": "ask_monthly_revenue"}
  ]
}
```

**Best Practices:**
- Ask one question at a time
- Use validation to ensure data quality
- Provide retry messages for misunderstandings
- Keep questions conversational, not interrogative

---

### 3. `branch` - Decision Point

**Purpose:** Routes caller based on collected data

**Example:**
```json
{
  "id": "qualification_branch",
  "type": "branch",
  "prompt": "Thank you for that information. Let me see what options we have for you...",
  "edges": [
    {
      "type": "conditional",
      "target": "qualified_outcome",
      "priority": 10,
      "conditions": [
        {"variable": "monthly_revenue", "operator": "gte", "value": 15000},
        {"variable": "business_age_months", "operator": "gte", "value": 6}
      ]
    },
    {
      "type": "conditional",
      "target": "disqualified_outcome",
      "priority": 8,
      "conditions": [
        {"variable": "business_age_months", "operator": "lt", "value": 6}
      ]
    },
    {
      "type": "fallback",
      "target": "manual_review_outcome",
      "priority": 1
    }
  ]
}
```

**How Branching Works:**
1. Edges evaluated in **priority order** (highest first)
2. First edge where **all conditions are true** wins
3. If no conditions match, **fallback edge** is used
4. Always include a fallback to avoid dead ends

**Operators:**
- `eq` - Equal to
- `ne` - Not equal to
- `gt` / `gte` - Greater than / Greater than or equal
- `lt` / `lte` - Less than / Less than or equal
- `in` - Value in array
- `contains` - String contains substring
- `exists` - Variable has been set

---

### 4. `transfer` - Transfer to Human

**Purpose:** Connects caller to live agent/department

**Example:**
```json
{
  "id": "qualified_outcome",
  "type": "transfer",
  "prompt": "Great news! I'm connecting you with a funding specialist now. Please hold for just a moment.",
  "metadata": {
    "transferDepartment": "Sales Team",
    "transferPhone": "+1-800-555-0100",
    "crmAction": "send_notification",
    "notificationRecipients": ["sales@premiermca.com", "#qualified-leads"]
  }
}
```

**Transfer Types:**
- **Warm transfer** - AI stays on line, introduces caller
- **Cold transfer** - AI hangs up, caller connects directly
- **Escalation** - Urgent transfer (angry caller, technical issue)

---

### 5. `end` - Terminate Call

**Purpose:** Ends call with closing message

**Example:**
```json
{
  "id": "callback_scheduled_end",
  "type": "end",
  "prompt": "Perfect! I've got you down for a follow-up next week. Thanks for calling Premier MCA, and have a great day!",
  "metadata": {
    "endReason": "callback_scheduled",
    "crmAction": "update_contact"
  }
}
```

**End Reasons:**
- `qualified_transfer` - Transferred to sales
- `disqualified` - Didn't meet criteria
- `callback_scheduled` - Follow-up scheduled
- `needs_manual_review` - Sent to underwriting
- `poor_connection` - Technical issue

---

### 6. `escalation` - Handle Upset Callers

**Purpose:** Emergency path for angry/frustrated callers

**Example:**
```json
{
  "id": "angry_caller",
  "type": "escalation",
  "prompt": "I sincerely apologize for any frustration. Let me connect you with a supervisor right away.",
  "metadata": {
    "transferDepartment": "Supervisor",
    "transferPhone": "+1-800-555-0199",
    "notificationRecipients": ["support@premiermca.com", "#escalations"]
  }
}
```

**When to Use:**
- Caller uses profanity or aggressive language
- Caller threatens legal action
- Caller demands to speak to manager
- Technical issue causing frustration

**Best Practices:**
- Apologize immediately (even if not your fault)
- Transfer quickly (don't argue or defend)
- Notify support team for follow-up
- Log escalation reason in CRM

---

### 7. `callback` - Schedule Follow-up

**Purpose:** Schedules future contact

**Example:**
```json
{
  "id": "callback_outcome",
  "type": "callback",
  "prompt": "I'll make sure someone follows up with you next week. What's the best email to reach you?",
  "variable": {
    "name": "email",
    "type": "email"
  }
}
```

---

### 8. `fallback` - Error Handling

**Purpose:** Handles unexpected situations (poor connection, validation failures, errors)

**Example:**
```json
{
  "id": "poor_connection",
  "type": "fallback",
  "prompt": "I'm having trouble hearing you clearly. Let me try calling you back at a better time."
}
```

---

## Edge Types & Flow Control

### Edge Priority System

Edges are evaluated **highest priority first**:

```json
"edges": [
  {"priority": 10, "type": "conditional", "target": "qualified"},    // Checked FIRST
  {"priority": 8,  "type": "conditional", "target": "disqualified"}, // Checked SECOND
  {"priority": 5,  "type": "conditional", "target": "callback"},     // Checked THIRD
  {"priority": 1,  "type": "fallback",    "target": "manual_review"} // Checked LAST
]
```

### Conditional Logic

**AND Logic (all conditions must be true):**
```json
"conditions": [
  {"variable": "monthly_revenue", "operator": "gte", "value": 15000},
  {"variable": "business_age_months", "operator": "gte", "value": 6},
  {"variable": "loan_amount", "operator": "gte", "value": 10000}
]
// ✅ PASSES if revenue >= $15K AND age >= 6 months AND loan >= $10K
// ❌ FAILS if ANY condition is false
```

**OR Logic (any condition can be true):**
```json
"edges": [
  {
    "conditions": [{"variable": "urgency", "operator": "eq", "value": "immediate"}],
    "target": "qualified"
  },
  {
    "conditions": [{"variable": "urgency", "operator": "eq", "value": "this_week"}],
    "target": "qualified"
  }
]
// ✅ PASSES if urgency is "immediate" OR "this_week"
```

**Better OR using `in` operator:**
```json
"conditions": [
  {"variable": "urgency", "operator": "in", "value": ["immediate", "this_week"]}
]
```

---

## Variable Types & Validation

### Variable Type Reference

| Type | Description | Example Values | Validation Options |
|------|-------------|----------------|-------------------|
| `string` | Free-form text | "Mike Johnson", "City Auto Repair" | `pattern` (regex) |
| `number` | Numeric values | 620, 36, 3 | `min`, `max` |
| `currency` | Dollar amounts | 50000, 15000.50 | `min`, `max` |
| `enum` | Multiple choice | "immediate", "this_week" | `enum` (allowed values) |
| `boolean` | Yes/no | true, false | None |
| `date` | Calendar dates | "2025-11-18" | `min`, `max` |
| `phone` | Phone numbers | "+18005550100" | `pattern` (regex) |
| `email` | Email addresses | "mike@example.com" | `pattern` (regex) |

### Validation Examples

**Currency with min/max:**
```json
{
  "name": "loan_amount",
  "type": "currency",
  "validation": {
    "required": true,
    "min": 5000,
    "max": 500000,
    "retryLimit": 2,
    "retryMessage": "We offer funding between $5,000 and $500,000. What amount works for you?"
  }
}
```

**Enum with predefined options:**
```json
{
  "name": "business_type",
  "type": "enum",
  "validation": {
    "required": true,
    "enum": ["retail", "restaurant", "service", "construction", "other"],
    "retryLimit": 2,
    "retryMessage": "Is your business in retail, restaurant, service, construction, or another industry?"
  }
}
```

**Email with regex pattern:**
```json
{
  "name": "email",
  "type": "email",
  "validation": {
    "required": false,
    "pattern": "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$",
    "retryLimit": 2,
    "retryMessage": "I didn't catch that email. Could you spell it out for me?"
  }
}
```

---

## Variable Substitution

### Using Variables in Prompts

Variables collected earlier in the call can be referenced in prompts using `{{variable_name}}`:

**Example:**
```json
{
  "id": "ask_loan_amount",
  "type": "question",
  "prompt": "Perfect. How much funding is {{business_name}} looking for today?"
}
```

If `business_name = "City Auto Repair"`, the AI will say:
> "Perfect. How much funding is **City Auto Repair** looking for today?"

### Substitution Examples

| Prompt Template | Variables | AI Says |
|----------------|-----------|---------|
| `"Great to meet you, {{contact_name}}."` | contact_name = "Mike" | "Great to meet you, Mike." |
| `"How long has {{business_name}} been in business?"` | business_name = "City Auto Repair" | "How long has City Auto Repair been in business?" |
| `"I've got you down for {{loan_amount}} in funding."` | loan_amount = "$50,000" | "I've got you down for $50,000 in funding." |

### Best Practices

✅ **DO:**
- Use variables to personalize the conversation
- Reference business name frequently (builds rapport)
- Confirm collected data back to caller

❌ **DON'T:**
- Reference variables before they're collected
- Overuse variables (sounds robotic)
- Use variables in the same node where they're collected

---

## Make.com Integration

### Webhook Structure

When a call ends, Retell sends a webhook to your Make.com scenario:

**Webhook Payload Example:**
```json
{
  "call_id": "call_xxxxxxxxxxxxxxxx",
  "scenario_id": "premier_mca_inbound_qualifier",
  "call_status": "completed",
  "end_reason": "qualified_transfer",
  "duration_seconds": 240,
  "timestamp": "2025-11-18T14:32:00Z",
  "variables": {
    "contact_name": "Mike Johnson",
    "business_name": "City Auto Repair",
    "loan_amount": 50000,
    "monthly_revenue": 45000,
    "business_age_months": 36,
    "urgency": "immediate"
  },
  "outcome": "qualified"
}
```

### Make.com Scenario Flow

```
1. [Webhook Trigger] - Receives call data from Retell
         ↓
2. [Router] - Routes based on outcome
         ↓
    ┌────┴─────┬─────────────┬──────────────┐
    ↓          ↓             ↓              ↓
[Qualified] [Disqualified] [Callback] [Escalation]
    ↓          ↓             ↓              ↓
Create Deal  Add to List  Schedule Task  Send Alert
    ↓          ↓             ↓              ↓
Notify Sales  Send Email  Create Reminder Notify Support
    ↓          ↓             ↓              ↓
Log to Notion Log to Notion Log to Notion Log to Notion
```

### Make.com Module Setup

**1. Webhook Trigger**
- Module: `Webhooks > Custom Webhook`
- URL: Copy webhook URL to `config.webhookUrl` in your scenario JSON
- Method: POST
- Data structure: Determine from sample payload

**2. Router**
- Module: `Flow Control > Router`
- Routes:
  - Route 1: `outcome = "qualified"`
  - Route 2: `outcome = "disqualified"`
  - Route 3: `outcome = "callback"`
  - Route 4: `outcome = "escalation"`

**3. HubSpot - Create/Update Contact**
- Module: `HubSpot > Create/Update Contact`
- Email: `{{variables.email}}`
- First Name: `{{variables.contact_name}}`
- Company: `{{variables.business_name}}`
- Custom Properties:
  - `monthly_revenue`: `{{variables.monthly_revenue}}`
  - `funding_requested`: `{{variables.loan_amount}}`
  - `time_in_business`: `{{variables.business_age_months}}`
  - `deal_urgency`: `{{variables.urgency}}`

**4. HubSpot - Create Deal (Qualified Only)**
- Module: `HubSpot > Create Deal`
- Deal Name: `"{{variables.business_name}} - ${{variables.loan_amount}} MCA"`
- Amount: `{{variables.loan_amount}}`
- Stage: `"New Lead"`
- Pipeline: `"MCA Lending"`
- Associate with Contact: `{{contact_id}}` (from previous step)

**5. Notion - Create Call Log**
- Module: `Notion > Create Database Item`
- Database: `"Call Logs"`
- Properties:
  - Contact: `{{variables.contact_name}}`
  - Business: `{{variables.business_name}}`
  - Loan Amount: `{{variables.loan_amount}}`
  - Outcome: `{{outcome}}`
  - Duration: `{{duration_seconds}}s`
  - Timestamp: `{{timestamp}}`

**6. Slack Notification (Qualified/Escalated Only)**
- Module: `Slack > Send Message`
- Channel: `#qualified-leads` or `#escalations`
- Message:
  ```
  🔥 New Qualified Lead!

  Contact: {{variables.contact_name}}
  Business: {{variables.business_name}}
  Funding: ${{variables.loan_amount}}
  Revenue: ${{variables.monthly_revenue}}/mo
  Urgency: {{variables.urgency}}

  👉 View in HubSpot: [Link]
  ```

---

## HubSpot Field Mapping

### Standard Contact Properties

| Variable Name | HubSpot Property | Data Type |
|--------------|------------------|-----------|
| `contact_name` | `firstname` | Single-line text |
| `business_name` | `company` | Single-line text |
| `email` | `email` | Email |
| `callback_phone` | `phone` | Phone number |

### Custom Contact Properties (Create These in HubSpot)

| Variable Name | HubSpot Property | Data Type | Options |
|--------------|------------------|-----------|---------|
| `monthly_revenue` | `monthly_revenue` | Number | Currency |
| `loan_amount` | `funding_requested` | Number | Currency |
| `business_age_months` | `time_in_business` | Number | None |
| `urgency` | `deal_urgency` | Dropdown | immediate, this_week, this_month, exploring, no_rush |
| `credit_score` | `credit_score` | Number | None |

### How to Create Custom Properties in HubSpot

1. Go to **Settings** → **Properties** → **Contact Properties**
2. Click **Create Property**
3. Fill in:
   - **Label:** "Monthly Revenue"
   - **Internal Name:** `monthly_revenue`
   - **Field Type:** Number
   - **Number Format:** Currency
4. Click **Create**
5. Repeat for each custom property

---

## Cost Model

### Retell API Pricing

- **Cost per minute:** $0.10
- **Average call duration:** 4 minutes
- **Cost per call:** ~$0.40

### Cost by Scenario Type

| Scenario | Avg Duration | Avg Nodes | Cost/Call | Monthly Cost (100 calls) |
|----------|--------------|-----------|-----------|--------------------------|
| Inbound Qualifier | 4 min | 8 | $0.40 | $40 |
| Outbound Prospecting | 2 min | 5 | $0.20 | $20 |
| Appointment Setter | 3 min | 6 | $0.30 | $30 |
| Customer Support | 5 min | 10 | $0.50 | $50 |

### Cost Optimization Tips

1. **Reduce unnecessary nodes** - Combine questions where natural
2. **Set max call duration** - Prevent runaway costs
3. **Use timeouts** - Auto-end inactive calls
4. **Pre-qualify via form** - Only call high-intent leads
5. **A/B test prompts** - Shorter prompts = faster calls

---

## Building Your Own Scenarios

### Step 1: Define Your Goal

**Example Goals:**
- Qualify inbound leads for MCA lending
- Schedule appointments for solar consultations
- Collect survey responses from customers
- Outbound prospecting for B2B SaaS

### Step 2: Map the Conversation Flow

Draw out your call flow on paper or use a tool like Figma/Miro:

```
START
  ↓
[Greeting] "Hi, I'm Sarah from Premier MCA..."
  ↓
[Question] "May I have your name?"
  ↓
[Question] "What's your business name?"
  ↓
[Question] "How much funding are you looking for?"
  ↓
[Branch] Check if qualified
  ↓
  ├─→ [Transfer] "Connecting you to sales..." → END
  ├─→ [End] "We'll follow up in 90 days..." → END
  └─→ [Callback] "Can I get your email?" → END
```

### Step 3: Identify Variables

List all data you need to collect:

| Variable | Type | Required? | Validation |
|----------|------|-----------|------------|
| contact_name | string | Yes | None |
| business_name | string | Yes | None |
| loan_amount | currency | Yes | $5K - $500K |
| monthly_revenue | currency | Yes | Min $0 |
| urgency | enum | Yes | 5 options |

### Step 4: Define Qualification Rules

Write out your branching logic:

- **Qualified:** revenue >= $15K AND business_age >= 6 months AND loan >= $10K
- **Disqualified:** business_age < 6 months
- **Callback:** urgency = "exploring" OR "no_rush"
- **Manual Review:** Everything else

### Step 5: Copy Template & Customize

1. Copy `inbound_qualifier.json`
2. Rename to `your_scenario.json`
3. Update `scenarioId`, `name`, `description`
4. Modify prompts to match your use case
5. Adjust variables and validation rules
6. Update branching conditions
7. Configure integrations (HubSpot, Notion, Slack)

### Step 6: Test Locally

Use the test payload generator (coming soon) to simulate calls:

```bash
node test-scenario.js your_scenario.json
```

### Step 7: Deploy to Retell

1. Upload scenario JSON via Retell API or dashboard
2. Configure phone number routing
3. Set webhook URL to your Make.com scenario
4. Test with real call

---

## Testing & Validation

### Validation Checklist

Before deploying, verify:

- [ ] All nodes have unique IDs
- [ ] Entry node exists and is reachable
- [ ] Every node (except `end`) has at least one outgoing edge
- [ ] All `conditional` edges have conditions defined
- [ ] All variables referenced in prompts are collected earlier
- [ ] All variables have validation rules
- [ ] Branch nodes have a fallback edge
- [ ] Webhook URL is configured in `config.webhookUrl`
- [ ] HubSpot properties exist in your account
- [ ] Make.com scenario is active and webhook is correct

### Testing Strategy

**1. Happy Path Test**
- Call scenario with ideal responses
- Verify all variables collected correctly
- Confirm webhook fires and data reaches HubSpot/Notion

**2. Edge Case Tests**
- Test disqualification paths
- Test escalation (angry caller)
- Test poor connection fallback
- Test validation failures (e.g., loan amount too high)

**3. Integration Tests**
- Verify HubSpot contact created/updated
- Verify Notion log entry created
- Verify Slack notification sent (if applicable)
- Check data accuracy in all systems

---

## Troubleshooting

### Common Issues

**Issue:** Webhook not firing
- **Fix:** Check `config.webhookUrl` is correct and Make.com scenario is active

**Issue:** Variables not substituting in prompts
- **Fix:** Ensure variable is collected before referenced (check node order)

**Issue:** Branch always takes fallback path
- **Fix:** Check condition operators and values match variable types

**Issue:** HubSpot property not updating
- **Fix:** Verify `hubspotProperty` name matches exactly (case-sensitive)

**Issue:** Call ends prematurely
- **Fix:** Check for nodes without outgoing edges (except `end` nodes)

---

## Next Steps

### Planned Templates

1. ✅ **Inbound Qualifier** (Premier MCA) - DONE
2. ⏳ **Outbound Prospecting** - Cold call script with objection handling
3. ⏳ **Appointment Setter** - Calendar booking with Calendly integration
4. ⏳ **Customer Support** - FAQ handling with knowledge base lookup
5. ⏳ **Survey Collection** - Post-purchase satisfaction survey

### Planned Tools

1. **Test Payload Generator** - Simulate calls without using Retell minutes
2. **Scenario Validator** - Check JSON for errors before deployment
3. **Cost Calculator** - Estimate monthly costs based on call volume
4. **Flow Diagram Generator** - Auto-generate visual flowcharts from JSON
5. **Make.com Template Exporter** - One-click Make.com blueprint creation

---

## Support

**Questions?** Contact chris@resultantai.com

**Issues?** Open an issue in the GitHub repo

**Want a custom template built?** Let's talk about your use case!

---

## License

MIT License - Use freely for your consultancy projects

---

**Built by ResultantAI** | Helping consultancies ship AI voice agents faster
