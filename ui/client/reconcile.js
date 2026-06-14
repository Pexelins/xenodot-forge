// Keyed list reconciler. Reuses existing DOM nodes by key instead of rebuilding
// the list, so event handlers, input focus, and in-flight CSS transitions on
// unchanged rows survive a re-render. Single pass, minimal moves. This is what
// lets the render-from-state views replace replaceChildren()+rebuild without
// the flicker, lost focus, and orphaned timers that pattern caused.

/**
 * Reconcile `container`'s children to match `items`, keyed by `opts.key`.
 *  - unchanged key: node reused, patched via `opts.update`
 *  - new key:       node built via `opts.create`
 *  - vanished key:  node removed
 * Node identity rides on `dataset.key`.
 * @template T
 * @param {HTMLElement} container
 * @param {readonly T[]} items
 * @param {{
 *   key: (item: T) => string,
 *   create: (item: T) => HTMLElement,
 *   update?: (node: HTMLElement, item: T) => void,
 * }} opts
 */
export function reconcile(container, items, opts) {
  /** @type {Map<string, HTMLElement>} key -> live node currently in the DOM */
  const existing = new Map();
  for (const child of Array.from(container.children)) {
    const node = /** @type {HTMLElement} */ (child);
    if (node.dataset.key != null) existing.set(node.dataset.key, node);
  }

  /** @type {Set<string>} */
  const seen = new Set();
  /** Cursor into the live child list — the slot the next item should occupy.
   * @type {ChildNode | null} */
  let cursor = container.firstChild;

  for (const item of items) {
    const k = opts.key(item);
    seen.add(k);
    let node = existing.get(k);
    if (node) {
      opts.update?.(node, item);
    } else {
      node = opts.create(item);
      node.dataset.key = k;
    }
    if (cursor === node) {
      cursor = node.nextSibling; // already in place — advance past it
    } else {
      container.insertBefore(node, cursor); // move/insert before the current slot
    }
  }

  // Drop nodes whose key no longer appears.
  for (const [k, node] of existing) {
    if (!seen.has(k)) node.remove();
  }
}
