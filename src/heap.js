/**
 * Binary min-heap ordered by a caller-supplied comparator.
 * Used as the priority queue of Dijkstra, A* and greedy best-first search.
 * @template T
 */
export class MinHeap {
  /** @type {T[]} */
  #items = [];
  /** @type {(a: T, b: T) => boolean} */
  #less;

  /**
   * @param {(a: T, b: T) => boolean} less Returns true when `a` must leave the heap before `b`.
   */
  constructor(less) {
    this.#less = less;
  }

  /** Number of items in the heap. */
  get size() {
    return this.#items.length;
  }

  /**
   * Adds an item.
   * @param {T} item
   */
  push(item) {
    const items = this.#items;
    items.push(item);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.#less(items[i], items[parent])) return;
      this.#swap(i, parent);
      i = parent;
    }
  }

  /**
   * Removes and returns the first item, or undefined when the heap is empty.
   * @returns {T | undefined}
   */
  pop() {
    const items = this.#items;
    if (items.length === 0) return undefined;
    const top = items[0];
    const last = items.pop();
    if (items.length > 0) {
      items[0] = last;
      this.#siftDown(0);
    }
    return top;
  }

  #siftDown(start) {
    const items = this.#items;
    let i = start;
    for (;;) {
      const left = 2 * i + 1;
      const right = left + 1;
      let first = i;
      if (left < items.length && this.#less(items[left], items[first])) first = left;
      if (right < items.length && this.#less(items[right], items[first])) first = right;
      if (first === i) return;
      this.#swap(i, first);
      i = first;
    }
  }

  #swap(a, b) {
    const items = this.#items;
    [items[a], items[b]] = [items[b], items[a]];
  }
}
