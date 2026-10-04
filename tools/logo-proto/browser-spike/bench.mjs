// One model, one execution provider, one picture size. Everything is timed inside the page with performance.now().
import * as ort from './node_modules/onnxruntime-web/dist/ort.all.min.mjs';
ort.env.wasm.wasmPaths = '/node_modules/onnxruntime-web/dist/';

const stats = (xs) => { const s = [...xs].sort((a, b) => a - b); return { min: s[0], median: s[s.length >> 1], max: s.at(-1) }; };

async function picture(size) {
  const bmp = await createImageBitmap(await (await fetch('./data/bench.jpg')).blob());
  const c = new OffscreenCanvas(size, size); const g = c.getContext('2d');
  g.drawImage(bmp, 0, 0, size, size);
  const { data } = g.getImageData(0, 0, size, size);
  const out = new Float32Array(3 * size * size);
  for (let i = 0; i < size * size; i++) for (let k = 0; k < 3; k++) out[k * size * size + i] = (data[i * 4 + k] / 255 - 0.5) / 0.5;
  return out;
}

window.bench = async ({ model, ep, size = 512, threads = 0, runs = 5, fp16Input = false }) => {
  const result = { model, ep, size, threads };
  try {
    if (ep === 'webgpu') {
      result.hasWebGPU = Boolean(navigator.gpu) && Boolean(await navigator.gpu.requestAdapter());
      if (!result.hasWebGPU) throw new Error('no WebGPU adapter in this browser');
    }
    ort.env.wasm.numThreads = threads || 1;
    const t0 = performance.now();
    const buf = await (await fetch(model)).arrayBuffer();
    result.fetchMs = performance.now() - t0;
    const t1 = performance.now();
    const session = await ort.InferenceSession.create(buf, { executionProviders: [ep], graphOptimizationLevel: 'all' });
    result.createMs = performance.now() - t1;
    const name = session.inputNames[0];
    const data = await picture(size);
    const dims = [1, 3, size, size];
    const feeds = () => ({ [name]: new ort.Tensor('float32', data, dims) });
    const times = [];
    for (let i = 0; i < runs + 1; i++) {
      const t = performance.now();
      const out = await session.run(feeds());
      // Reading the result back is part of the cost: on WebGPU the run is not finished until the data is on the CPU.
      const first = out[session.outputNames[0]];
      await first.getData();
      times.push(performance.now() - t);
      result.outputDims = first.dims;
    }
    result.firstRunMs = times[0];           // includes shader compile / kernel setup
    result.steady = stats(times.slice(1));  // what a second picture costs
    result.jsHeapMB = performance.memory ? performance.memory.usedJSHeapSize / 1e6 : null;
    await session.release();
  } catch (e) { result.error = String(e?.message ?? e).slice(0, 400); }
  return result;
};
window.benchReady = true;
