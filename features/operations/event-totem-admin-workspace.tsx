"use client";

import { useState } from "react";
import type { EventTotemLayout } from "./event-totem-layout";
import { EventTotemLayoutEditor } from "./event-totem-layout-editor";
import { EventTotemRosterPrint } from "./event-totem-roster-print";

type Option = { id: string; label: string };
/** The printable annex always uses the last successfully saved layout, never unsaved edits. */
export function EventTotemAdminWorkspace({ eventName, initialLayout, boxes, blocks, assignments, onSave }: {
  eventName: string;
  initialLayout: EventTotemLayout;
  boxes: Option[];
  blocks: Option[];
  assignments: Array<Option & { blockId: string }>;
  onSave: (layout: EventTotemLayout) => Promise<void>;
}) {
  const [persistedLayout, setPersistedLayout] = useState(initialLayout);
  return <div className="space-y-6">
    <div className="print:hidden"><EventTotemLayoutEditor initialLayout={initialLayout} boxes={boxes} blocks={blocks} assignments={assignments} onSave={onSave} onSaved={setPersistedLayout} /></div>
    <EventTotemRosterPrint eventName={eventName} layout={persistedLayout} blocks={blocks.map(item => ({ id: item.id, name: item.label }))} boxes={boxes} assignments={assignments} />
  </div>;
}
