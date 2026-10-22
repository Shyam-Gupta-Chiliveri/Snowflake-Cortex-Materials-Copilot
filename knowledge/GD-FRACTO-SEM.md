---
id: GD-FRACTO-SEM
title: Guide: SEM fractography and the U-Net ductile / brittle classifier
category: Guide
---
# SEM fractography of axle fracture surfaces

## 1. What to look for
Ductile fracture shows dimples: cup-shaped micro-voids that form, grow and coalesce before the part breaks. Brittle fracture in martensite shows cleavage facets: flat, shiny planes with river patterns, and sometimes intergranular facets along prior austenite grain boundaries.

## 2. Image preparation
Images are taken in secondary-electron mode at several zoom levels. Before classification they are filtered, and augmented copies (zoom, skew, compression) are used for training, so one physical spot can appear as several image files.

## 3. U-Net classifier
A U-Net segmentation network with a ResNet50 encoder labels every pixel as ductile (dimple) or brittle (cleavage). The ductile percentage of an image is ductile pixels divided by all classified pixels. The model was trained on the project's SEM images; it is a decision aid and does not replace a metallurgist's review.

## 4. Linking images to process routes
Image file names carry the test version, the group letter and often the tempering temperature (for example "Version-6 Part 1 Group-F 240C"). The pipeline parses the name to link an image to a process route. Images from the QUW23 campaign and Version 11 images without a group letter cannot be linked and are reported separately.

## 5. How to read SEM and lab ductility together
Lab ductility % comes from the mechanical test on the whole sample. SEM ductile % is the dimple area fraction in the imaged field of view. They measure different things, so compare the ranking of routes, not the absolute numbers. A route whose SEM images are mostly cleavage while lab ductility is acceptable needs a second look at sampling.
