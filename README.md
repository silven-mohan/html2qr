# HTML to QR

**Put a complete, small HTML page inside a single QR code.** Create the code in your browser, scan it with a phone, and view the reconstructed page without uploading the HTML to a server.

[Open HTML to QR](https://html2qr.vercel.app)

![Diagram showing the two HTML-to-QR encoding methods and the built-in page viewer](assets/encoding-workflows.svg)

## Encoding methods

Choose how the HTML should travel in the QR code:

- **Compress, then decode on a page:** HTML is optionally minified, compressed with GZIP, encoded as URL-safe Base64, and prefixed with `HTMLQR1:`. The QR contains a link to this app with the payload in its URL fragment. When opened, the app decodes the content locally and displays it in a sandboxed iframe. Enter the deployed app URL in the workbench so scanning opens the decoder. The page content is carried by the QR; it is not uploaded to the app's server.
- **Convert to a data URL:** HTML is optionally minified and embedded directly in a `data:text/html` URL. This needs no hosting or decoder, but supports less HTML because the uncompressed page must fit in the QR. Some scanner apps display data URLs as text; if that happens, copy the URL into a browser address bar.

The built-in minifier removes comments and collapses whitespace while preserving the contents of `script`, `pre`, and `textarea` elements. You can turn minification off in the workbench.

## Create a QR code

1. Open [html2qr.vercel.app](https://html2qr.vercel.app).
2. Choose a method and paste or edit the HTML source.
3. For compressed mode, confirm the hosted app URL is set. The deployed URL is filled in automatically when using the hosted app.
4. Choose an error-correction level and whether to minify.
5. Check the live capacity meter, then select **Generate QR code**.
6. Scan the result. To save it, right-click the QR image on desktop or press and hold it on a touch device.

![Illustration of the four error-correction settings and their maximum byte-mode payload sizes](assets/qr-capacity.svg)

The meter shows the payload size against the selected QR capacity. Higher error correction can make a code more resilient to damage, but leaves room for less data. If a payload exceeds the selected capacity, generation is disabled. Capacity figures are for QR Code Version 40 in byte mode; actual generated codes use the smallest version that fits.

## Run locally

This is a static browser app. Serve the project directory over HTTP (localhost is treated as a secure context by modern browsers):

```sh
python3 -m http.server 8000
```

Then visit <http://localhost:8000>. Compressed mode uses the browser's `CompressionStream` and `DecompressionStream` APIs. The QR generator library is loaded from cdnjs, so an internet connection is needed for QR generation.

To deploy your own copy, host the files as a static site and use that site's base URL in the compressed-mode URL field. The URL must point to the app that will decode the `HTMLQR1:` fragment.

## Privacy and safety

- HTML is processed in the browser; this app does not send the page source to a backend.
- Compressed payloads are stored in the QR code's URL fragment, not as server-side page data.
- Decoded HTML runs in a sandboxed iframe. The sandbox allows scripts, forms, and popups, but does not grant same-origin access.
- A QR code is not encryption. Anyone who scans or obtains the code can read its payload. Do not encode secrets or sensitive information.

## Project files

- `index.html` contains the app interface and page structure.
- `script.js` implements minification, payload encoding/decoding, capacity checks, and QR rendering.
- `qr-burst.js` defines the animated `<qr-burst>` web component used for the intro.
- `style.css` contains the responsive interface styles.

## License

This project is distributed under the [Apache License 2.0](LICENSE). See the license file for the full terms.