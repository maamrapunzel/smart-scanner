# SMART SCANNER V2 — What changed from the earlier Apps Script build

## Platform
- Converted from Google Apps Script HTML Service to a normal static HTML/CSS/JavaScript app for GitHub Pages.
- No `google.script.run` dependency.
- HTTPS on GitHub Pages allows the browser camera API to work more naturally than the Apps Script iframe.

## Answer sheets
- Personalized learner answer sheets.
- QR code identifies assessment + learner + page.
- Four black corner calibration markers retained.
- Mixed item layout supports MCQ, TRUE/FALSE, NUMERICAL, and ALGEBRAIC on the same assessment.
- 25 items per A4 page.

## Scanning
- Live camera is now a primary workflow.
- Upload-photo fallback retained.
- QR auto-selection of learner/page with manual fallback.
- Denser corner-square detection to reduce false marker matches.
- MCQ and TRUE/FALSE bubble reading includes a confidence value.
- NUMERICAL and ALGEBRAIC responses are cropped and shown for teacher review instead of pretending handwritten OCR is reliable.

## Results & analysis
- Browser-local result storage.
- JSON backup/restore.
- CSV export.
- Excel export with RESULTS, RESPONSES, ITEM ANALYSIS, and COMPETENCIES sheets.
- Mean score, MPS, highest, lowest.
- Item analysis.
- Competency mastery and Most/Least Mastered views.
- Adjustable mastery threshold (default 75%).

## Master Excel
- Uses **Term** instead of Quarter/Term.
- Supports 4 or 5 MCQ choices.
- Accepted answers may be separated with `|` or `;`.
- Algebraic answers are manually reviewed and then matched to the main/accepted answer forms listed by the teacher.
