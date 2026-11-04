import { test } from "node:test";
import assert from "node:assert/strict";
import { PoseMapper, type PoseLandmark } from "../src/input/pose";

function standingPose(): PoseLandmark[] {
  const points = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 0.95,
  }));
  points[11] = { x: 0.4, y: 0.3, z: 0, visibility: 0.95 };
  points[12] = { x: 0.6, y: 0.3, z: 0, visibility: 0.95 };
  points[23] = { x: 0.43, y: 0.55, z: 0.02, visibility: 0.95 };
  points[24] = { x: 0.57, y: 0.55, z: 0.02, visibility: 0.95 };
  points[25] = { x: 0.43, y: 0.72, z: 0.02, visibility: 0.95 };
  points[26] = { x: 0.57, y: 0.72, z: 0.02, visibility: 0.95 };
  points[27] = { x: 0.43, y: 0.95, z: 0.02, visibility: 0.95 };
  points[28] = { x: 0.57, y: 0.95, z: 0.02, visibility: 0.95 };
  points[15] = { x: 0.35, y: 0.75, z: 0, visibility: 0.95 };
  points[16] = { x: 0.65, y: 0.75, z: 0, visibility: 0.95 };
  return points;
}

test("neutral standing pose calibrates and produces no locomotion", () => {
  const mapper = new PoseMapper();
  const pose = standingPose();
  const drive = mapper.update(pose)!;
  assert.ok(mapper.baselineShoulderWidth > 0);
  assert.equal(drive.vx, 0);
  assert.ok(Math.abs(drive.yaw) < 0.01);
  assert.equal(drive.crouched, false);
});

test("moving closer drives forward and moving left/right steers toward the person", () => {
  const mapper = new PoseMapper();
  const pose = standingPose();
  mapper.update(pose);
  pose[11].x = 0.35;
  pose[12].x = 0.65;
  const closer = mapper.update(pose)!;
  assert.ok(closer.vx > 0);
  pose[23].x = 0.68;
  pose[24].x = 0.82;
  pose[11].x = 0.65;
  pose[12].x = 0.95;
  const rightSide = mapper.update(pose)!;
  assert.ok(rightSide.yaw < 0);
});

test("raising one arm directs the duck head and a deep squat toggles crouch", () => {
  const mapper = new PoseMapper();
  const pose = standingPose();
  mapper.update(pose);
  pose[16].y = 0.05;
  const armRaised = mapper.update(pose)!;
  assert.ok(armRaised.headYaw < 0);
  pose[15].y = 0.05;
  const bothArmsRaised = mapper.update(pose)!;
  assert.ok(bothArmsRaised.headPitch > 0);

  pose[25].x = 0.30;
  pose[26].x = 0.70;
  pose[25].y = 0.70;
  pose[26].y = 0.70;
  const crouched = mapper.update(pose)!;
  assert.equal(crouched.crouched, true);
});

test("missing upper-body landmarks return null rather than sending unsafe commands", () => {
  const mapper = new PoseMapper();
  const pose = standingPose();
  mapper.update(pose);
  pose[11].visibility = 0.1;
  assert.equal(mapper.update(pose), null);
});
