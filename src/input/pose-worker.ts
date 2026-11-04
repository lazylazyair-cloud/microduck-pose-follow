type PoseMessage =
  | { type: "init" }
  | { type: "frame"; bitmap: ImageBitmap; timestamp: number; sequence: number }
  | { type: "close" };

type WorkerScope = {
  onmessage: ((event: MessageEvent<PoseMessage>) => void) | null;
  postMessage(message: unknown): void;
  close(): void;
};

const scope = self as unknown as WorkerScope;
let landmarker: any = null;
let loading: Promise<void> | null = null;

async function initialize() {
  if (landmarker) return;
  if (loading) return loading;
  loading = (async () => {
    const moduleUrl =
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/vision_bundle.mjs";
    const wasmUrl =
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm";
    const modelUrl =
      "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
    const vision = await import(/* @vite-ignore */ moduleUrl);
    const files = await vision.FilesetResolver.forVisionTasks(wasmUrl);
    const options = {
      runningMode: "VIDEO",
      numPoses: 1,
      minPoseDetectionConfidence: 0.55,
      minPosePresenceConfidence: 0.55,
      minTrackingConfidence: 0.55,
    };
    try {
      landmarker = await vision.PoseLandmarker.createFromOptions(files, {
        ...options,
        baseOptions: { modelAssetPath: modelUrl, delegate: "GPU" },
      });
    } catch {
      landmarker = await vision.PoseLandmarker.createFromOptions(files, {
        ...options,
        baseOptions: { modelAssetPath: modelUrl, delegate: "CPU" },
      });
    }
  })();
  try {
    await loading;
    scope.postMessage({ type: "ready" });
  } catch (error) {
    loading = null;
    scope.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

scope.onmessage = (event: MessageEvent<PoseMessage>) => {
  const message = event.data;
  if (message.type === "init") {
    void initialize().catch(() => {});
    return;
  }
  if (message.type === "close") {
    landmarker?.close?.();
    landmarker = null;
    scope.close();
    return;
  }
  if (message.type === "frame") {
    const { bitmap, timestamp, sequence } = message;
    if (!landmarker) {
      bitmap.close();
      return;
    }
    try {
      const result = landmarker.detectForVideo(bitmap, timestamp);
      scope.postMessage({
        type: "landmarks",
        sequence,
        landmarks: result.landmarks?.[0] ?? null,
      });
    } catch (error) {
      scope.postMessage({
        type: "frame-error",
        sequence,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      bitmap.close();
    }
  }
};

export {};
