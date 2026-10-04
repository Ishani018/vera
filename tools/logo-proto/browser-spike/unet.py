"""A small U-Net: picture in, ink map out. Plain ops only (conv, batch norm folded at export, relu, transposed conv), so every runtime has them."""
import torch, torch.nn as nn

def block(i, o):
    return nn.Sequential(nn.Conv2d(i, o, 3, padding=1, bias=False), nn.BatchNorm2d(o), nn.ReLU(inplace=True),
                         nn.Conv2d(o, o, 3, padding=1, bias=False), nn.BatchNorm2d(o), nn.ReLU(inplace=True))

class UNet(nn.Module):
    def __init__(self, c=16, depth=4):
        super().__init__()
        ch = [c * 2 ** i for i in range(depth + 1)]
        self.down = nn.ModuleList([block(3, ch[0])] + [block(ch[i], ch[i + 1]) for i in range(depth)])
        self.up = nn.ModuleList([nn.ConvTranspose2d(ch[i + 1], ch[i], 2, stride=2) for i in reversed(range(depth))])
        self.dec = nn.ModuleList([block(ch[i] * 2, ch[i]) for i in reversed(range(depth))])
        self.pool = nn.MaxPool2d(2)
        self.out = nn.Conv2d(ch[0], 1, 1)

    def forward(self, x):
        skips = []
        for i, d in enumerate(self.down):
            x = d(x if i == 0 else self.pool(x))
            skips.append(x)
        x = skips.pop()
        for up, dec in zip(self.up, self.dec):
            x = dec(torch.cat([up(x), skips.pop()], 1))
        return torch.sigmoid(self.out(x))

def params(c, depth=4):
    return sum(p.numel() for p in UNet(c, depth).parameters())

if __name__ == "__main__":
    for c in (8, 12, 16, 20, 24, 28, 32, 40, 48):
        n = params(c)
        print(f"c={c:3d} params={n/1e6:6.2f} M  fp32={n*4/1e6:6.1f} MB  fp16={n*2/1e6:6.1f} MB  int8={n/1e6:6.1f} MB")
