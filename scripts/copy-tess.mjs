// Runs before `next build` and `next dev` (npm "prebuild" / "predev").
// The scan page (/s/<code>) reads the two bottom lines of a passport's photo page with
// tesseract.js. Its worker, its engine and the English model must be served by us (the
// defaults are CDNs): copy them from the installed packages into public/tess/ so they always
// match the installed library. public/tess/ is gitignored (about 15 MB).
// The page loads them only when "Passport" is pressed; a phone downloads one engine file
// (about 4 MB) and the model (about 3 MB) the first time.
import { copyFileSync, mkdirSync } from "node:fs";

const dir = new URL("../public/tess/", import.meta.url);
mkdirSync(dir, { recursive: true });
const files = [
  ["../node_modules/tesseract.js/dist/worker.min.js", "worker.min.js"],
  // the engine: tesseract.js picks one of these by what the browser's WebAssembly can do
  ["../node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js", "tesseract-core-lstm.wasm.js"],
  ["../node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js"],
  ["../node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js", "tesseract-core-relaxedsimd-lstm.wasm.js"],
  ["../node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz", "eng.traineddata.gz"],
];
for (const [from, to] of files) copyFileSync(new URL(from, import.meta.url), new URL(to, dir));
console.log("tesseract files copied to public/tess/");
