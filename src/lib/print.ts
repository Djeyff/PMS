export function printElement(el: HTMLElement, options: { title?: string } = {}) {
  // Remove any previous print root
  const prev = document.getElementById("__print_root__");
  if (prev) prev.remove();
  const previousTitle = document.title;
  if (options.title) document.title = options.title;

  const root = document.createElement("div");
  root.id = "__print_root__";

  // Clone to detach from dialogs/transforms/overflow containers
  const clone = el.cloneNode(true) as HTMLElement;
  root.appendChild(clone);

  document.body.appendChild(root);
  document.body.classList.add("print-report");

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    document.body.classList.remove("print-report");
    const n = document.getElementById("__print_root__");
    if (n) n.remove();
    document.title = previousTitle;
  };

  // Some mobile browsers are flaky with afterprint; still try.
  window.addEventListener("afterprint", cleanup, { once: true });

  // Give the browser a moment to layout before printing (helps mobile)
  window.setTimeout(() => {
    window.print();
  }, 350);

  // Fallback cleanup
  window.setTimeout(cleanup, 2000);
}
