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

test("CCU maps all seven boxes to their distinct AM and PM operator assignments", () => {
  const ccu = [
    ["00c160d9-e784-4745-8000-f11a948fd804", "9423c532-a860-438d-acf6-f1ecbd9c9016", "9153f95b-a232-4e29-a035-40332a8703f6"],
    ["d7653946-6b14-4d89-bb33-e4a9679b1808", "970e2d18-ca70-440f-87f0-3952918b5baa", "9536b21e-a73d-42f1-9ef7-d6cb8b49df09"],
    ["3e8dbb82-9db2-452c-8324-54285838fe8b", "b4dd734a-7fda-4f36-847d-527bd4ae525c", "f91e07d5-16a5-4b09-8611-f8b0841245b6"],
    ["77f60fb0-6b3c-4b90-89d8-89e8d70b7f22", "4a645fd7-b95a-46f7-800a-6b535c27509a", "09402a7a-c8ae-4ac8-acb6-aa536ed207a3"],
    ["9c890636-60f8-43ac-95c9-85f9f48499c8", "46aee2a4-8a37-43f4-9854-b0cb9da87788", "894d8627-c54c-43e3-a96d-00b6729d4a1f"],
    ["3ce27eb9-bfb1-4da2-9e17-3ed516817fe3", "a2a10ecb-a571-4633-95ff-913ab4771a8c", "30ae84ef-d349-4720-83cd-1dbdc16a9dd3"],
    ["d4fecf8d-e7b9-4c4a-ac01-4b3244dc776d", "bd0de6b6-9393-49b4-8710-5e60c9e89854", "03514c42-86bb-44cd-b452-cefe75ae59bb"],
  ];
  const am = "dca7783d-2c93-434a-b634-c9bd9a035157";
  const pm = "4395ba18-170e-470e-aa31-e5c6e79950d7";
  const rows = resolvePaperBlockLayout(ccu.map(([assetId, amAssignment, pmAssignment], i) => ({
    id: `ccu-position-${i + 1}`, assetId,
    blocks: [{ blockId: am, assignmentId: amAssignment }, { blockId: pm, assignmentId: pmAssignment }],
  })), [am, pm]);
  assert.equal(rows.length, 14);
  assert.equal(new Set(rows.map((row) => row.assetId)).size, 7);
  assert.equal(new Set(rows.map((row) => row.assignmentId)).size, 14);
  assert.deepEqual(rows.filter((row) => row.assetId === ccu[1][0]).map((row) => row.assignmentId), [ccu[1][1], ccu[1][2]]);
});
