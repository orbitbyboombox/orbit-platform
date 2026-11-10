import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("D-10 cron does not construct or dispatch collection emails automatically", () => {
    const source = readFileSync(new URL("../../app/api/cron/wedding-d10/route.ts", import.meta.url), "utf8");
    assert.equal(source.includes("buildCollectionEmailHtml"), false);
    assert.equal(source.includes('tasks.push({ type: "COLLECTION_D10"'), false);
    assert.equal(source.includes('tasks.push({ type: "EVENT_READY_D10"'), true);
});
