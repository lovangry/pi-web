"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  POLYFORGE_PROGRESS_EXPANDED_DEFAULT,
  POLYFORGE_PROGRESS_EXPANDED_EVENT,
  POLYFORGE_PROGRESS_ORDER_DEFAULT,
  POLYFORGE_PROGRESS_ORDER_EVENT,
  POLYFORGE_QUEUE_VIEW_DEFAULT,
  POLYFORGE_QUEUE_VIEW_EVENT,
  readPolyforgeProgressExpanded,
  readPolyforgeProgressOrder,
  readPolyforgeQueueView,
  writePolyforgeProgressExpanded,
  writePolyforgeProgressOrder,
  writePolyforgeQueueView,
  type PolyforgeProgressExpanded,
  type PolyforgeProgressOrder,
  type PolyforgeQueueView,
} from "@/lib/polyforge-view-preferences";

/** Re-read on a toggle in this tab (the preference event, sent whether or
 *  not storage kept it) or a write in another tab (`storage`). No fetch. */
function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(POLYFORGE_QUEUE_VIEW_EVENT, onChange);
  window.addEventListener(POLYFORGE_PROGRESS_ORDER_EVENT, onChange);
  window.addEventListener(POLYFORGE_PROGRESS_EXPANDED_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(POLYFORGE_QUEUE_VIEW_EVENT, onChange);
    window.removeEventListener(POLYFORGE_PROGRESS_ORDER_EVENT, onChange);
    window.removeEventListener(POLYFORGE_PROGRESS_EXPANDED_EVENT, onChange);
  };
}

// Stable snapshots: the same primitive until a toggle or a stored change.
const readQueueViewSnapshot = readPolyforgeQueueView;
const readProgressOrderSnapshot = readPolyforgeProgressOrder;
const readProgressExpandedSnapshot = readPolyforgeProgressExpanded;
// The server render (and hydration) uses the defaults — the card grid,
// newest first, the progress folded — so server and client markup agree.
const serverQueueView = () => POLYFORGE_QUEUE_VIEW_DEFAULT;
const serverProgressOrder = () => POLYFORGE_PROGRESS_ORDER_DEFAULT;
const serverProgressExpanded = () => POLYFORGE_PROGRESS_EXPANDED_DEFAULT;

/** The Polyforge panel's inline view choices, each stored under its own
 *  `pi-web:polyforge-*` localStorage key: the Jobs queue's card/list
 *  presentation (default card), the execution-progress order (default
 *  newest first) and whether the progress block stands open (default
 *  folded — 默认收起). */
export function usePolyforgeViewPreferences(): {
  queueView: PolyforgeQueueView;
  setQueueView: (view: PolyforgeQueueView) => void;
  progressOrder: PolyforgeProgressOrder;
  setProgressOrder: (order: PolyforgeProgressOrder) => void;
  progressExpanded: PolyforgeProgressExpanded;
  setProgressExpanded: (expanded: PolyforgeProgressExpanded) => void;
} {
  const queueView = useSyncExternalStore(subscribe, readQueueViewSnapshot, serverQueueView);
  const progressOrder = useSyncExternalStore(subscribe, readProgressOrderSnapshot, serverProgressOrder);
  const progressExpanded = useSyncExternalStore(subscribe, readProgressExpandedSnapshot, serverProgressExpanded);
  const setQueueView = useCallback((view: PolyforgeQueueView) => writePolyforgeQueueView(view), []);
  const setProgressOrder = useCallback((order: PolyforgeProgressOrder) => writePolyforgeProgressOrder(order), []);
  const setProgressExpanded = useCallback((expanded: PolyforgeProgressExpanded) => writePolyforgeProgressExpanded(expanded), []);
  return { queueView, setQueueView, progressOrder, setProgressOrder, progressExpanded, setProgressExpanded };
}
