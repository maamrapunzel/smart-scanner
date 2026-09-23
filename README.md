# SMART SCANNER V2 — GitHub Pages Edition

A static HTML/CSS/JavaScript assessment scanner designed for GitHub Pages.

## Main features
- Master Excel download + import (the template is generated directly in the browser)
- Mixed item types: MCQ, TRUE/FALSE, NUMERICAL, ALGEBRAIC
- Personalized A4 answer sheets
- QR learner + page identification
- Four-corner page calibration
- Live camera on HTTPS/GitHub Pages
- Photo upload fallback
- MCQ and TRUE/FALSE automatic bubble reading
- Numerical and Algebraic cropped-answer teacher review
- Scores stored in browser localStorage
- Results export to CSV and Excel
- Item Analysis, Mean Score, MPS, Highest, Lowest
- Competency mastery analysis
- JSON backup / restore
- PWA shell caching after first load

## Publish on GitHub Pages
1. In GitHub, open **Settings > Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Choose branch **main** and folder **/(root)**, then save.
4. Open the Pages URL after GitHub finishes publishing.

## Important test instructions
- Print answer sheets at **100% / Actual Size** on A4.
- Keep all four black corner markers clean and visible.
- Keep the whole page inside the camera view, flat, bright, and without heavy shadows.
- MCQ and TRUE/FALSE are auto-read.
- NUMERICAL and ALGEBRAIC responses are cropped and shown for teacher review.
- Verify scanner accuracy on sample papers before using for official/high-stakes grades.

## Data storage
This version is client-side. Assessment data and results are stored in the current browser using localStorage. Use **Backup JSON** before changing devices or clearing browser data.

## Libraries loaded from CDN
- SheetJS
- QRCode.js
- jsQR
