import { test } from "node:test";
import assert from "node:assert/strict";
import { base64UrlDecode, base64UrlEncode, extractBody, headerValue, sanitizeHeaderValue } from "./gmail.ts";

test("sanitizeHeaderValue strips CR/LF to prevent email header injection", () => {
  assert.equal(sanitizeHeaderValue("a@b.com\r\nBcc: evil@example.com"), "a@b.com Bcc: evil@example.com");
  assert.equal(sanitizeHeaderValue("plain"), "plain");
});

test("base64UrlEncode/Decode round-trips without +, /, or padding", () => {
  const text = "To: a@b.com\r\nSubject: hi\r\n\r\nbody with ??? chars";
  const encoded = base64UrlEncode(text);
  assert.equal(/[+/=]/.test(encoded), false);
  assert.equal(base64UrlDecode(encoded), text);
});

test("headerValue is case-insensitive and defaults to empty string", () => {
  const headers = [{ name: "Subject", value: "Hi" }];
  assert.equal(headerValue(headers, "subject"), "Hi");
  assert.equal(headerValue(headers, "From"), "");
});

test("extractBody prefers text/plain over text/html and recurses into parts", () => {
  const plain = base64UrlEncode("plain text");
  const html = base64UrlEncode("<p>html</p>");

  assert.equal(
    extractBody({
      mimeType: "multipart/alternative",
      parts: [
        { mimeType: "text/html", body: { data: html } },
        { mimeType: "text/plain", body: { data: plain } },
      ],
    }),
    "plain text",
  );
});

test("extractBody falls back to text/html when there's no plain-text part", () => {
  const html = base64UrlEncode("<p>html</p>");
  assert.equal(
    extractBody({ mimeType: "multipart/alternative", parts: [{ mimeType: "text/html", body: { data: html } }] }),
    "<p>html</p>",
  );
});
