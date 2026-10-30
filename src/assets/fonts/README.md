# Korean score-sheet font

`NotoSansKR-Regular.ttf` is bundled under the SIL Open Font License in `OFL.txt`.
Source: https://github.com/google/fonts/tree/main/ofl/notosanskr (NotoSansKR[wght].ttf).

Prepared once with fontTools 4.60.1: instantiate the variable font at `wght=400`, then remove the GSUB table so embedded glyphs map directly to Unicode. This preserves searchable Korean text and avoids PDF fontkit subset outline defects. The PDF generator embeds the complete prepared TTF. Python/fontTools are **not** application or user prerequisites.

The server generates PDFs with pdf-lib and @pdf-lib/fontkit. Same-origin PDF.js renders the exact PDF pages to 300 dpi JPEGs in the browser. No external conversion service, font CDN, or user-installed font is used. Keep this TTF and OFL license in deployment artifacts; Next.js tracing explicitly includes the font.
