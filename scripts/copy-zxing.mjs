// Runs before `next build` and `next dev` (npm "prebuild" / "predev").
// The Aadhaar scan page (/s/<code>) decodes QR codes with zxing-wasm, whose .wasm file must be
// served by us (the default is a CDN). Copy it from the installed package into public/zxing/ so
// it always matches the installed JS glue. public/zxing/ is gitignored.
import { copyFileSync, mkdirSync } from "node:fs";

const from = new URL("../node_modules/zxing-wasm/dist/reader/zxing_reader.wasm", import.meta.url);
const dir = new URL("../public/zxing/", import.meta.url);
mkdirSync(dir, { recursive: true });
copyFileSync(from, new URL("zxing_reader.wasm", dir));
// The UPI payment page (/pay) makes a QR code with the writer half of the same package.
copyFileSync(new URL("../node_modules/zxing-wasm/dist/writer/zxing_writer.wasm", import.meta.url), new URL("zxing_writer.wasm", dir));
console.log("zxing wasm copied to public/zxing/");
