import { mkdirSync, copyFileSync } from "node:fs";
mkdirSync("public/runtime", { recursive: true });
for (const f of ["ort-wasm-simd-threaded.wasm", "ort-wasm-simd-threaded.mjs"])
  copyFileSync("node_modules/onnxruntime-web/dist/" + f, "public/runtime/" + f);
copyFileSync(
  "node_modules/@mujoco/mujoco/mujoco.wasm",
  "public/runtime/mujoco.wasm",
);
mkdirSync("public/mediapipe/wasm", { recursive: true });
for (const f of [
  "vision_wasm_internal.js",
  "vision_wasm_internal.wasm",
  "vision_wasm_nosimd_internal.js",
  "vision_wasm_nosimd_internal.wasm",
]) {
  copyFileSync(
    "node_modules/@mediapipe/tasks-vision/wasm/" + f,
    "public/mediapipe/wasm/" + f,
  );
}
