import test from "node:test";
import assert from "node:assert/strict";
import { resolvePaperBlockLayout } from "../features/portal-authentication/paper-block-layout.ts";

const positions = [
  { id: "totem-1", assetId: "CASE-01", blocks: [
    { blockId: "am", assignmentId: "sofia-am" },
    { blockId: "pm", assignmentId: "sofia-pm" },
  ] },
  { id: "totem-2", assetId: "CASE-02", blocks: [
    { blockId: "am", assignmentId: "sebastian-am" },
    { blockId: "pm", assignmentId: "vaitiare-pm" },
  ] },
];

test("resolves both shifts for each asset without depending on ordering", () => {
  const rows = resolvePaperBlockLayout(positions, ["am", "pm"]);
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.filter((row) => row.assetId === "CASE-02").map((row) => row.assignmentId), ["sebastian-am", "vaitiare-pm"]);
});
test("rejects duplicate physical assets", () => {
  assert.throws(() => resolvePaperBlockLayout([...positions, { ...positions[0], id: "totem-3" }], ["am", "pm"]), /duplicada/);
});
test("rejects missing PM shift", () => {
  assert.throws(() => resolvePaperBlockLayout([{ ...positions[0], blocks: positions[0].blocks.slice(0, 1) }], ["am", "pm"]), /Faltan turnos/);
});
test("rejects repeated assignment IDs", () => {
  assert.throws(() => resolvePaperBlockLayout([{ ...positions[0], blocks: [
    positions[0].blocks[0], { blockId: "pm", assignmentId: "sofia-am" },
  ] }], ["am", "pm"]), /duplicada/);
});
test("rejects unexpected operational blocks", () => {
  assert.throws(() => resolvePaperBlockLayout([{ ...positions[0], blocks: [
    positions[0].blocks[0], { blockId: "night", assignmentId: "night-operator" },
  ] }], ["am", "pm"]), /desconocido/);
});
