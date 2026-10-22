---
id: PR-8D
title: Procedure: nonconformance handling and 8D problem solving
category: Procedure
---
# Nonconformance and 8D

## 1. When to open a nonconformance (NCR)
Open an NCR when a test result is outside the release criteria, when a fracture surface is cleavage-dominated, or when a customer or a downstream process reports a failure. Each NCR names the process route, the part and the observed defect.

## 2. Classification
Every NCR is classified into one of: heat treatment, material chemistry, geometry or machining, die-casting or assembly, testing or measurement. In the data platform this classification is done automatically by an LLM function and can be corrected by the quality engineer.

## 3. 8D steps
D1 team, D2 problem description, D3 containment, D4 root cause (verified), D5 corrective action, D6 implementation and effectiveness check, D7 prevention (update work instructions and control plan), D8 closure. A problem counts as solved only when the effectiveness check shows no recurrence.

## 4. Escalation to IT service management
NCRs that block delivery, or that need a change in the test system or the data platform, are raised as incidents in the IT service management tool (for example ServiceNow) with the NCR number in the short description.
