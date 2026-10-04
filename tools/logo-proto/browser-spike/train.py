"""Overfit one size on the 22 pairs. Quality is not the point; the point is a real trained network to export and time."""
import sys, time, numpy as np, torch
from unet import UNet, params

SIZES = {"s": 18, "m": 36, "l": 58}
name = sys.argv[1]; steps = int(sys.argv[2]) if len(sys.argv) > 2 else 300
c = SIZES[name]
dev = "mps" if torch.backends.mps.is_available() else "cpu"
d = np.load("data/pairs.npz")
x = torch.from_numpy(d["x"]).permute(0, 3, 1, 2).float().div(255)
y = torch.from_numpy(d["y"]).float().div(255).unsqueeze(1)
torch.manual_seed(0)
net = UNet(c).to(dev)
print(f"{name}: c={c} params={params(c)/1e6:.2f} M fp16={params(c)*2/1e6:.1f} MB device={dev}", flush=True)
opt = torch.optim.AdamW(net.parameters(), 2e-3)
sched = torch.optim.lr_scheduler.OneCycleLR(opt, 3e-3, total_steps=steps)
t0 = time.time()
for step in range(steps):
    idx = torch.randperm(len(x))[:4]
    xb, yb = x[idx].to(dev), y[idx].to(dev)
    p = net(xb)
    bce = torch.nn.functional.binary_cross_entropy(p, yb)
    dice = 1 - (2 * (p * yb).sum() + 1) / (p.sum() + yb.sum() + 1)
    loss = bce + dice
    opt.zero_grad(); loss.backward(); opt.step(); sched.step()
    if step % 25 == 0 or step == steps - 1:
        print(f"{name} step {step:4d} loss {loss.item():.4f} bce {bce.item():.4f} dice {dice.item():.3f} {time.time()-t0:.0f}s", flush=True)
net.eval()
with torch.no_grad():
    ps = torch.cat([net(x[i:i + 2].to(dev)).cpu() for i in range(0, len(x), 2)])
    dice = 1 - (2 * (ps * y).sum() + 1) / (ps.sum() + y.sum() + 1)
print(f"{name} final dice-loss on the 22 pairs (train set): {dice.item():.3f}", flush=True)
import os; os.makedirs("models", exist_ok=True)
torch.save({"c": c, "state": net.cpu().state_dict()}, f"models/{name}.pt")
