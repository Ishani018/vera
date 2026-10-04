"""Export a trained size to ONNX three ways: fp32, fp16 (for WebGPU) and static int8 QDQ (for the WASM CPU runtime). Checks each against PyTorch."""
import sys, os, numpy as np, torch, onnx, onnxruntime as ort
from onnxconverter_common import float16
from onnxruntime.quantization import quantize_static, CalibrationDataReader, QuantFormat, QuantType
from unet import UNet

name = sys.argv[1]
ck = torch.load(f"models/{name}.pt")
net = UNet(ck["c"]); net.load_state_dict(ck["state"]); net.eval()
d = np.load("data/pairs.npz")
x = torch.from_numpy(d["x"]).permute(0, 3, 1, 2).float().div(255)
sample = x[:1]
fp32 = f"models/{name}-fp32.onnx"
torch.onnx.export(net, sample, fp32, input_names=["image"], output_names=["ink"], opset_version=17, dynamo=False, do_constant_folding=True)
m = onnx.load(fp32)
onnx.save(float16.convert_float_to_float16(m, keep_io_types=True), f"models/{name}-fp16.onnx")

class Reader(CalibrationDataReader):
    def __init__(self): self.it = iter([{"image": x[i:i + 1].numpy()} for i in range(0, 22, 3)])
    def get_next(self): return next(self.it, None)
quantize_static(fp32, f"models/{name}-int8.onnx", Reader(), quant_format=QuantFormat.QDQ,
                activation_type=QuantType.QUInt8, weight_type=QuantType.QInt8)

with torch.no_grad(): ref = net(sample).numpy()
for kind in ("fp32", "fp16", "int8"):
    f = f"models/{name}-{kind}.onnx"
    out = ort.InferenceSession(f, providers=["CPUExecutionProvider"]).run(None, {"image": sample.numpy()})[0]
    print(f"{name}-{kind}: {os.path.getsize(f)/1e6:6.1f} MB, max |onnx - torch| = {np.abs(out - ref).max():.4f}, mean {np.abs(out - ref).mean():.5f}")
