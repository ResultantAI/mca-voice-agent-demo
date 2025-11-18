# Test Payloads for Voice Agent Scenarios

This directory contains test payloads for validating voice agent call flows without using Retell API minutes.

## Available Test Cases

### 1. `qualified.json` - Qualified Lead ✅
**Expected Outcome:** Transfer to Sales

- Contact: Mike Johnson
- Business: City Auto Repair
- Loan Amount: $50,000
- Monthly Revenue: $45,000
- Business Age: 36 months (3 years)
- Urgency: Immediate

**Why it qualifies:**
- Revenue >= $15,000 ✓
- Business age >= 6 months ✓
- Loan amount >= $10,000 ✓

---

### 2. `disqualified.json` - Too Early Stage ❌
**Expected Outcome:** Polite Decline + Nurture Campaign

- Contact: Sarah Martinez
- Business: Fresh Start Bakery
- Loan Amount: $25,000
- Monthly Revenue: $8,000
- Business Age: 4 months
- Urgency: This week

**Why it's disqualified:**
- Business age < 6 months ✗
- Revenue < $15,000 ✗

---

### 3. `callback.json` - Future Follow-up 📅
**Expected Outcome:** Schedule Callback

- Contact: David Chen
- Business: Chen's Restaurant Supply
- Loan Amount: $75,000
- Monthly Revenue: $28,000
- Business Age: 18 months
- Urgency: Exploring (not urgent)
- Email: david@chensrestaurant.com

**Why it triggers callback:**
- Urgency = "exploring" (not immediate)
- Qualifies financially, but not ready to proceed

---

### 4. `manual_review.json` - Borderline Case 🔍
**Expected Outcome:** Manual Review by Underwriting

- Contact: Roberto Martinez
- Business: Martinez Landscaping
- Loan Amount: $35,000
- Monthly Revenue: $13,000
- Business Age: 24 months
- Urgency: This month

**Why it needs manual review:**
- Revenue < $15,000 (but close)
- Business age >= 6 months ✓
- Doesn't fully qualify, but not disqualified either

---

### 5. `high_value.json` - Premium Lead 💎
**Expected Outcome:** Transfer to Sales (High Priority)

- Contact: Jennifer Williams
- Business: Williams Medical Supplies Inc
- Loan Amount: $250,000
- Monthly Revenue: $180,000
- Business Age: 84 months (7 years)
- Urgency: Immediate

**Why it's high value:**
- Very high revenue ($180K/month)
- Well-established business (7 years)
- Large loan request ($250K)
- Immediate urgency

---

## Usage

### Test with a specific payload:
```bash
node test-scenario.js inbound_qualifier.json --payload test-payloads/qualified.json
```

### Test all payloads:
```bash
for file in test-payloads/*.json; do
  echo "Testing: $file"
  node test-scenario.js inbound_qualifier.json --payload "$file"
  echo ""
done
```

### Interactive testing:
```bash
node test-scenario.js inbound_qualifier.json --interactive
```

---

## Creating Custom Payloads

Create a JSON file with variables matching your scenario's `variables` array:

```json
{
  "contact_name": "John Doe",
  "business_name": "Doe Enterprises",
  "loan_amount": 100000,
  "monthly_revenue": 50000,
  "business_age_months": 12,
  "urgency": "this_week"
}
```

**Variable Types:**
- `string`: Text values (names, emails)
- `number`: Numeric values (months, counts)
- `currency`: Dollar amounts (no `$` symbol, just numbers)
- `enum`: Predefined options (e.g., "immediate", "this_week", "exploring")
- `boolean`: true/false
- `email`: Email addresses
- `phone`: Phone numbers

---

## Qualification Rules (Premier MCA)

### Qualified:
- Monthly revenue >= $15,000
- Business age >= 6 months
- Loan amount >= $10,000

### Disqualified:
- Business age < 6 months

### Callback:
- Urgency = "exploring" OR "no_rush"

### Manual Review:
- Everything else (doesn't fit other categories)

---

## Next Steps

After testing, you can:

1. **Validate the flow** - Ensure branches work correctly
2. **Adjust thresholds** - Modify qualification rules in `inbound_qualifier.json`
3. **Add new nodes** - Expand the call flow
4. **Create edge cases** - Test escalation, poor connection, etc.
5. **Deploy to Retell** - Upload the validated scenario

---

**Tip:** Always test with multiple payloads before deploying to production!
