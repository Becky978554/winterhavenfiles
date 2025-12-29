# sheep-management-site

Utility pages (open in the same browser/profile running the app):

- `undo-import.html` — run the application's `undoLastImport()` helper from your browser to revert the previous CSV import (if available in sessionStorage).
- `export-sheep.html` — open in the same browser/profile running the app to download `sheep-*` records from localStorage as JSON files.

Serve the folder with a static server (e.g. `node serve.js`) and open `index.html`.