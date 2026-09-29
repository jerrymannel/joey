---
name: web-browsing
description: Open web pages in a headless Chrome (the chrome-devtools MCP tools) to read, pull and summarise their content.
---

# Browsing the web

You have a headless Chrome through the `chrome-devtools` MCP server.

1. `new_page` with the URL (or `navigate_page` on the current page).
2. `wait_for` some text you expect, if the page loads content late.
3. `take_snapshot` to read the page — its text and structure, with a `uid` per element. Prefer it to screenshots.
4. `click` a `uid` from the snapshot to follow links or open "read more"; snapshot again after.
5. For long articles, `evaluate_script` with `() => document.body.innerText` returns the plain text in one go.
6. `close_page` when done.

When summarising: cite the URL of every page you used, quote numbers and names exactly as the page has them,
and say so if a page was blocked (login wall, CAPTCHA, paywall) rather than guessing its content. Never sign in
or submit forms. Save long extracts to a file in the task folder rather than keeping them in the conversation.
