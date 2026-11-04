export interface PoseLandmark {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

export interface PoseDrive {
  vx: number;
  yaw: number;
  neckPitch: number;
  headPitch: number;
  headYaw: number;
  headRoll: number;
  crouched: boolean;
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

function visible(p: PoseLandmark | undefined): p is PoseLandmark {
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.y) &&
    (p.visibility === undefined || p.visibility >= 0.45);
}

function average(a: PoseLandmark, b: PoseLandmark) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: ((a.z ?? 0) + (b.z ?? 0)) / 2,
  };
}

function kneeAngle(hip: PoseLandmark, knee: PoseLandmark, ankle: PoseLandmark) {
  const ax = hip.x - knee.x;
  const ay = hip.y - knee.y;
  const bx = ankle.x - knee.x;
  const by = ankle.y - knee.y;
  const denominator = Math.hypot(ax, ay) * Math.hypot(bx, by);
  if (denominator < 1e-5) return 180;
  const cosine = clamp((ax * bx + ay * by) / denominator, -1, 1);
  return (Math.acos(cosine) * 180) / Math.PI;
}

/**
 * Converts MediaPipe's 2D/relative-depth landmarks into safe commands for the
 * Microduck's existing locomotion policy and its four head/neck joints.
 * The robot has no arms, so raised arms are expressed as head attention.
 */
export class PoseMapper {
  baselineShoulderWidth = 0;
  lastLandmarks: PoseLandmark[] | null = null;
  crouched = false;
  private smoothed: PoseDrive = {
    vx: 0,
    yaw: 0,
    neckPitch: 0,
    headPitch: 0,
    headYaw: 0,
    headRoll: 0,
    crouched: false,
  };

  calibrate(landmarks = this.lastLandmarks): boolean {
    if (!landmarks) return false;
    const left = landmarks[11];
    const right = landmarks[12];
    if (!visible(left) || !visible(right)) return false;
    const width = Math.hypot(right.x - left.x, right.y - left.y);
    if (!Number.isFinite(width) || width < 0.035) return false;
    this.baselineShoulderWidth = width;
    this.smoothed.vx = 0;
    this.smoothed.yaw = 0;
    return true;
  }

  reset() {
    this.baselineShoulderWidth = 0;
    this.lastLandmarks = null;
    this.crouched = false;
    this.smoothed = {
      vx: 0,
      yaw: 0,
      neckPitch: 0,
      headPitch: 0,
      headYaw: 0,
      headRoll: 0,
      crouched: false,
    };
  }

  update(landmarks: PoseLandmark[]): PoseDrive | null {
    this.lastLandmarks = landmarks;
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    const leftHip = landmarks[23];
    const rightHip = landmarks[24];
    if (
      !visible(leftShoulder) ||
      !visible(rightShoulder) ||
      !visible(leftHip) ||
      !visible(rightHip)
    ) {
      return null;
    }

    const shoulder = average(leftShoulder, rightShoulder);
    const hip = average(leftHip, rightHip);
    const shoulderWidth = Math.hypot(
      rightShoulder.x - leftShoulder.x,
      rightShoulder.y - leftShoulder.y,
    );
    const torsoHeight = Math.max(
      0.12,
      Math.hypot(shoulder.x - hip.x, shoulder.y - hip.y),
    );
    if (!this.baselineShoulderWidth) this.calibrate(landmarks);

    const scale = this.baselineShoulderWidth
      ? shoulderWidth / this.baselineShoulderWidth
      : 1;
    const depthDelta = scale - 1;
    const forward = Math.abs(depthDelta) < 0.055
      ? 0
      : Math.sign(depthDelta) * Math.min(0.4, (Math.abs(depthDelta) - 0.055) * 2.8);

    // The duck turns toward the person as they move away from the frame center
    // or lean sideways. This is intentionally a turn-in-place, not a false
    // promise of lateral strafing (the robot has no lateral gait command).
    const leanX = (shoulder.x - hip.x) / torsoHeight;
    const centerOffset = hip.x - 0.5;
    const turn = clamp(-centerOffset * 1.7 - leanX * 0.45, -1, 1);

    const leftWrist = landmarks[15];
    const rightWrist = landmarks[16];
    const armLift = (wrist: PoseLandmark | undefined, shoulderPoint: PoseLandmark) =>
      visible(wrist)
        ? clamp((shoulderPoint.y - wrist.y) / (torsoHeight * 0.72), 0, 1)
        : 0;
    const leftLift = armLift(leftWrist, leftShoulder);
    const rightLift = armLift(rightWrist, rightShoulder);

    const forwardLean = clamp(
      (((hip.z ?? 0) - (shoulder.z ?? 0)) / torsoHeight) * 1.5,
      -1,
      1,
    );
    const shoulderTilt = (rightShoulder.y - leftShoulder.y) * 2.2;

    const leftKnee = landmarks[25];
    const leftAnkle = landmarks[27];
    const rightKnee = landmarks[26];
    const rightAnkle = landmarks[28];
    if (
      visible(leftKnee) &&
      visible(leftAnkle) &&
      visible(rightKnee) &&
      visible(rightAnkle)
    ) {
      const bend = (
        kneeAngle(leftHip, leftKnee, leftAnkle) +
        kneeAngle(rightHip, rightKnee, rightAnkle)
      ) / 2;
      if (!this.crouched && bend < 112) this.crouched = true;
      else if (this.crouched && bend > 150) this.crouched = false;
    }

    const next: PoseDrive = {
      vx: forward,
      yaw: turn,
      neckPitch: clamp(forwardLean * 0.1, -0.12, 0.12),
      headPitch: clamp(
        forwardLean * 0.24 + ((leftLift + rightLift) / 2) * 0.12,
        -0.24,
        0.24,
      ),
      headYaw: clamp((leftLift - rightLift) * 0.42, -0.42, 0.42),
      headRoll: clamp(leanX * 0.12 + shoulderTilt, -0.18, 0.18),
      crouched: this.crouched,
    };

    const alpha = 0.22;
    for (const key of ["vx", "yaw", "neckPitch", "headPitch", "headYaw", "headRoll"] as const) {
      this.smoothed[key] += alpha * (next[key] - this.smoothed[key]);
    }
    this.smoothed.crouched = this.crouched;
    return { ...this.smoothed };
  }

  neutral(): PoseDrive {
    const alpha = 0.2;
    for (const key of ["vx", "yaw", "neckPitch", "headPitch", "headYaw", "headRoll"] as const) {
      this.smoothed[key] += alpha * (0 - this.smoothed[key]);
    }
    this.smoothed.crouched = this.crouched;
    return { ...this.smoothed };
  }
}
