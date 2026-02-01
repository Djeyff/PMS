export function printElement(element: HTMLElement, opts?: { title?: string }) {
  const title = opts?.title ?? "Print";
  const win = window.open("", "_blank", "noopener,noreferrer,width=1000,height=700");
  if (!win) {
    throw new Error("Popup blocked");
  }

  const baseHref = document.baseURI;

  // Copy ONLY CSS into the print window (no scripts), otherwise the SPA can boot in the new window and blank it.
  const styleTags = Array.from(document.querySelectorAll("style")).map((n) => (n as HTMLElement).outerHTML).join("\n");
  const linkTags = Array.from(document.querySelectorAll('link[rel="stylesheet"], link[rel="preconnect"], link[rel="dns-prefetch"]'))
    .map((n) => (n as HTMLElement).outerHTML)
    .join("\n");

  // We print the *content* of the element to avoid Radix Dialog portal/overlay quirks.
  const contentHtml = element.innerHTML;

  win.document.open();
  win.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <base href="${baseHref}">
    <title>${title}</title>
    ${linkTags}
    ${styleTags}
    <style>
      body { background: white !important; color: black !important; }
      @page { size: Letter; margin: 0.5in; }
      @media print {
        .print\\:hidden { display: none !important; }
        table thead { display: table-header-group; }
        table tfoot { display: table-footer-group; }
        tr { page-break-inside: avoid; }
      }
    </style>
  </head>
  <body>
    <div class="invoice-print bg-white text-black p-6">${contentHtml}</div>
  </body>
</html>`);
  win.document.close();

  const triggerPrint = () => {
    try {
      win.focus();
      win.print();
    } finally {
      win.close();
    }
  };

  // Give the browser a tick to layout (and load images) before printing.
  win.onload = () => setTimeout(triggerPrint, 250);
  setTimeout(triggerPrint, 500);
}