# Job Apply Helper

Chrome extension that scans a job application, asks for answers you have not given before, stores them in the browser, and autofills them on later sites. A resume uploaded in the popup is attached to resume/CV file fields.

Answers never leave this browser (`chrome.storage.local`).

## Install in Chrome

1. Open `chrome://extensions`
2. Turn on **Developer mode**
3. Click **Load unpacked**
4. Select this folder

## Use

1. Open the extension popup and upload a resume on the Apply tab.
2. Open a job application form.
3. Click **Apply**. Known fields and the resume fill immediately. New questions appear in the popup — answer them and click **Save & fill remaining**.
4. Use **Saved answers** to view, edit, or delete anything stored.

To try it locally, serve the demo page (file URLs do not run content scripts by default):

```bash
python3 -m http.server 8765
```

Then open `http://localhost:8765/demo/application.html`.

## Notes

- Password fields are ignored on purpose.
- Some applicant-tracking systems use custom widgets instead of normal inputs; those cannot always be filled.
- Programmatic resume upload works on standard `<input type="file">` fields. Sites that only accept drag-and-drop may still need a manual drop.
