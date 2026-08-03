# Install the Novah private-beta extension

Until the Chrome Web Store review is complete, invited testers can use the
unpacked production build supplied by the publisher.

## Install

1. Download and unzip the Novah extension package into a folder you will keep.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode**.
4. Select **Load unpacked**.
5. Choose the unzipped folder containing `manifest.json`.
6. Pin Novah from Chrome's Extensions menu, then select the Novah icon to open
   the side panel.
7. Sign in using the same Novah account you use at
   `https://novah-ten.vercel.app`.

## Capture and recall

1. Select text on an HTTPS webpage.
2. Right-click the selection and choose **Save to Novah**.
3. Review the exact selection and optional source details in the side panel.
4. Choose a Type or leave **Let Novah decide** selected, then save.
5. Use the Recall tab to search your saved notes in natural language.

For Chrome PDF pages, selected-text capture is best effort. If Chrome does not
provide the source URL, paste it into the optional source field before saving.

## Update or remove

- For a new unpacked build, replace the files in the same folder and select
  **Reload** on `chrome://extensions`.
- To remove Novah, select **Remove** on `chrome://extensions`.
- Removing the extension deletes local drafts and its local sign-in session; it
  does not delete notes already saved to your Novah account.

## Send feedback

Include the Chrome version, Novah version, page type (article or PDF), the action
you attempted and the exact error text. Do not include private note content,
passwords, tokens or screenshots containing sensitive information.

## Phase 9 clean-profile verification

Use a temporary Chrome profile created through **Profile → Add → Continue
without an account**. This keeps existing extensions, cookies and browsing
history out of the test.

1. In the temporary profile, open `chrome://extensions`.
2. Turn on **Developer mode** and select **Load unpacked**.
3. Choose `release/chrome-web-store/novah-0.1.0-unpacked` from this workspace.
4. Confirm Chrome displays **Novah**, version `0.1.0`, with the purple lightning
   icon and no installation error.
5. Select the toolbar icon and confirm the Novah side panel opens.
6. Sign in with a disposable Novah test account. Keep its password private and
   do not save it in Chrome.
7. Open `https://example.com`, select its example paragraph, right-click and
   choose **Save to Novah**.
8. Confirm the exact selected text, page title and HTTPS URL appear in Capture.
9. Choose an explicit Type and save. Confirm the success view shows the same
   original text.
10. Search Recall for a phrase from the saved note and confirm that note appears.
11. Close and reopen the side panel; confirm sign-in persists.
12. Remove the extension and delete the temporary Chrome profile after evidence
    is captured.

Record pass or failure for every numbered action. A failed action keeps Phase 9
item 9.8 open.
