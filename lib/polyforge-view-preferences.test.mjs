import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const prefs = await jiti.import("./polyforge-view-preferences.ts");
const { POLYFORGE_QUEUE_VIEW_KEY: QKEY, POLYFORGE_PROGRESS_ORDER_KEY: OKEY, POLYFORGE_PROGRESS_EXPANDED_KEY: EKEY } = prefs;

function withWindow(storage, fn) {
  const events = [];
  const previous = globalThis.window;
  globalThis.window = { localStorage: storage, dispatchEvent: (event) => { events.push(event.type); return true; } };
  try { return fn(events); } finally { globalThis.window = previous; }
}
const memoryStorage = (initial = {}) => {
  const data = new Map(Object.entries(initial));
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), data };
};
const throwing = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); } };

test("keys and defaults are the documented ones (card grid, newest first, progress folded)", () => {
  assert.equal(QKEY, "pi-web:polyforge-queue-view");
  assert.equal(OKEY, "pi-web:polyforge-progress-order");
  assert.equal(EKEY, "pi-web:polyforge-progress-expanded");
  assert.deepEqual([prefs.POLYFORGE_QUEUE_VIEW_DEFAULT, prefs.POLYFORGE_PROGRESS_ORDER_DEFAULT], ["card", "desc"], "the queue defaults to the card grid, the progress to newest first");
  assert.equal(prefs.POLYFORGE_PROGRESS_EXPANDED_DEFAULT, false, "the progress block defaults to folded (默认收起)");
  assert.equal(prefs.POLYFORGE_QUEUE_VIEW_EVENT, "pi-web:polyforge-queue-view-changed");
  assert.equal(prefs.POLYFORGE_PROGRESS_ORDER_EVENT, "pi-web:polyforge-progress-order-changed");
  assert.equal(prefs.POLYFORGE_PROGRESS_EXPANDED_EVENT, "pi-web:polyforge-progress-expanded-changed");
});

test("absent, corrupt and wrong-typed values parse to the defaults", () => {
  for (const raw of [null, undefined, "", "bogus", "CARDS", "ascending", 1, {}, "card ", "list\n"]) {
    assert.equal(prefs.parsePolyforgeQueueView(raw), "card", String(raw));
    assert.equal(prefs.parsePolyforgeProgressOrder(raw), "desc", String(raw));
    assert.equal(prefs.parsePolyforgeProgressExpanded(raw), false, String(raw));
  }
  assert.equal(prefs.parsePolyforgeQueueView("list"), "list");
  assert.equal(prefs.parsePolyforgeProgressOrder("asc"), "asc");
  assert.equal(prefs.parsePolyforgeProgressExpanded("true"), true, "only the exact \"true\" reads open");
  for (const raw of ["True", "TRUE", "1", "yes", " false\n"]) {
    assert.equal(prefs.parsePolyforgeProgressExpanded(raw), false, String(raw));
  }
});

test("reads go through storage and survive a throwing storage", () => {
  withWindow(memoryStorage({ [QKEY]: "list", [OKEY]: "desc", [EKEY]: "true" }), () => {
    assert.equal(prefs.readPolyforgeQueueView(), "list");
    assert.equal(prefs.readPolyforgeProgressOrder(), "desc");
    assert.equal(prefs.readPolyforgeProgressExpanded(), true);
  });
  withWindow(memoryStorage({ [QKEY]: "nope", [OKEY]: "", [EKEY]: "open" }), () => {
    assert.equal(prefs.readPolyforgeQueueView(), "card");
    assert.equal(prefs.readPolyforgeProgressOrder(), "desc");
    assert.equal(prefs.readPolyforgeProgressExpanded(), false, "a corrupted entry can never force the stream open");
  });
  withWindow(throwing, () => {
    assert.equal(prefs.readPolyforgeQueueView(), "card");
    assert.equal(prefs.readPolyforgeProgressOrder(), "desc");
    assert.equal(prefs.readPolyforgeProgressExpanded(), false);
  });
});

test("a write stores the value and announces it; a refused write still takes effect for the page", () => {
  const storage = memoryStorage();
  withWindow(storage, (events) => {
    prefs.writePolyforgeQueueView("list");
    assert.equal(storage.data.get(QKEY), "list");
    prefs.writePolyforgeProgressOrder("asc");
    assert.equal(storage.data.get(OKEY), "asc");
    prefs.writePolyforgeProgressExpanded(true);
    assert.equal(storage.data.get(EKEY), "true");
    assert.deepEqual(events, ["pi-web:polyforge-queue-view-changed", "pi-web:polyforge-progress-order-changed", "pi-web:polyforge-progress-expanded-changed"]);
  });
  // A refused write keeps the choice in the session fallback, not storage.
  withWindow(throwing, (events) => {
    prefs.writePolyforgeQueueView("card");
    assert.equal(prefs.readPolyforgeQueueView(), "card");
    prefs.writePolyforgeProgressOrder("desc");
    assert.equal(prefs.readPolyforgeProgressOrder(), "desc");
    prefs.writePolyforgeProgressExpanded(false);
    assert.equal(prefs.readPolyforgeProgressExpanded(), false, "the refused write still takes effect for the page's lifetime");
    assert.deepEqual(events, ["pi-web:polyforge-queue-view-changed", "pi-web:polyforge-progress-order-changed", "pi-web:polyforge-progress-expanded-changed"]);
  });
});

test("the module and the hook stay browser-only: no fetch, no server write, all events heard", async () => {
  const lib = await readFile(new URL("./polyforge-view-preferences.ts", import.meta.url), "utf8");
  const hook = await readFile(new URL("../hooks/usePolyforgeViewPreferences.ts", import.meta.url), "utf8");
  for (const source of [lib, hook]) {
    assert.doesNotMatch(source, /\bfetch\(|from\s+["']node:|\/api\//);
  }
  for (const event of ["storage", "POLYFORGE_QUEUE_VIEW_EVENT", "POLYFORGE_PROGRESS_ORDER_EVENT", "POLYFORGE_PROGRESS_EXPANDED_EVENT"]) {
    assert.match(hook, new RegExp(`addEventListener\\(${event === "storage" ? `"${event}"` : event}, onChange\\)`), `${event} is heard`);
  }
  assert.match(hook, /useSyncExternalStore\(subscribe, readQueueViewSnapshot, serverQueueView\)/, "the server snapshot is the default card grid");
  assert.match(hook, /useSyncExternalStore\(subscribe, readProgressOrderSnapshot, serverProgressOrder\)/, "the server snapshot is the default newest first");
  assert.match(hook, /useSyncExternalStore\(subscribe, readProgressExpandedSnapshot, serverProgressExpanded\)/, "the server snapshot is the default folded progress");
});
