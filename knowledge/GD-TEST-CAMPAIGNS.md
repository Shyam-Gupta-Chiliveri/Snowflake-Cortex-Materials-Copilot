---
id: GD-TEST-CAMPAIGNS
title: Overview: test campaigns and groups in the axle data set
category: Guide
---
# Test campaigns in the axle data set

## 1. Structure
The data set holds 385,000 axle test records. Each record belongs to a test campaign version (3, 6, 11 or 14) and, inside a version, to a group (A to I). Records carry chemistry, the heat-treatment route, part variant (diameter, die-casting), sample count, hardness, bending force, and ductility.

## 2. Version 6: tempering temperature study
Groups A and B (two presses: Friulpress and the reference press) are untempered. Groups C, D, E and F receive an additional temper of 180, 200, 220 and 240 °C for 1 h. This version is the cleanest experiment for the effect of tempering temperature.

## 3. Version 11: series tempering
Group H uses series tempering at 200 °C for 3 h. Group I adds a second temper at 220 °C for 1 h.

## 4. Version 3 and Version 14
Version 3 (Group B, Freund press) uses series tempering without a recorded temperature. Version 14 uses vacuum hardening with 230 °C; part of it is re-tempered at 230 °C for 1 h.

## 5. How the platform names routes
The pipeline builds a route key from version, group and press, for example V6-F or V11-I, and adds -RT for the re-tempered part of Version 14.
