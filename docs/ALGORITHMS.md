# Algorithms

Every look the Line Art Lab offers is our own code implementing a published
algorithm. There is **no machine-learning model anywhere in it**: no pretrained
weights, no model download, no inference runtime, no third-party model licence
to honour or to explain to anybody.

That is a deliberate choice and it has consequences worth stating plainly:

- **Nothing to download.** The Lab works the first time, offline, on a plane.
- **Nothing to disclose.** In the interface this is simply *"Made with
  algorithms, no AI model."*
- **Deterministic.** The same picture and the same settings give the same bytes
  out, on any machine, forever. Pixel-hash fixtures hold us to it.
- **Nothing leaves the computer.** The whole pipeline runs in the browser.

## Provenance

All code in `lib/lineart/` is written from the published mathematics. No code
was copied or adapted from any paper's reference implementation, from any
repository that implements these papers, or from any model repository. The
references below are there so a reader can check the maths and so credit goes
where it is due; they are not a statement that any of their code is present,
because none of it is.

The citations are given from knowledge rather than fetched: this build sandbox's
egress policy denies `arxiv.org` and the usual publisher hosts, so they could
not be looked up here. Any of them is worth a second's checking before it goes
anywhere public.

## What is implemented, and after whom

| Stage | What it does | Published algorithm |
| --- | --- | --- |
| 1 | The difference-of-Gaussians response and its soft threshold | Winnemöller, Olsen and Gooch, *Real-Time Video Abstraction*, SIGGRAPH 2006; Winnemöller, *XDoG: Advanced Image Stylization with eXtended Difference-of-Gaussians*, NPAR 2011; Winnemöller, Kyprianidis and Olsen, *XDoG: An eXtended difference-of-Gaussians compendium*, Computers & Graphics 36(6), 2012 |
| 1 | Taking the difference across the picture's own direction and smoothing along it | Kang, Lee and Chui, *Coherent Line Drawing*, NPAR 2007 |
| 1 | The direction field itself, from the smoothed structure tensor | Standard structure-tensor analysis; the minor eigenvector as local tangent. (Kang's iterative refinement is deliberately **not** used — a closed form is faster and exactly reproducible.) |
| 2 | Edge-preserving smoothing | Tomasi and Manduchi, *Bilateral Filtering for Gray and Color Images*, ICCV 1998. Implemented as the separable two-pass approximation, which is an approximation and says so in the code; see Pham and van Vliet, *Separable Bilateral Filtering for Fast Video Preprocessing*, ICME 2005 |
| 2 | Edge-preserving smoothing that follows the picture's direction | Kuwahara et al., 1976; Kyprianidis, Kang and Döllner, *Image and Video Abstraction by Anisotropic Kuwahara Filtering*, Computer Graphics Forum 28(7), 2009 |
| 2 | Local contrast normalisation | Standard local mean and standard deviation normalisation |
| 2 | Approximating a Gaussian with three box passes, for statistics only | Wells, *Efficient Synthesis of Gaussian Filters by Cascaded Uniform Filters*, IEEE PAMI 1986. The two bracketing odd widths rather than three equal ones |
| 3 | Colour quantisation in a perceptual space | Lloyd, *Least Squares Quantization in PCM*, IEEE Trans. Information Theory 28(2), 1982; Arthur and Vassilvitskii, *k-means++*, SODA 2007 (seeding, made deterministic here); CIE L\*a\*b\*, CIE 1976 |
| 3 | Labelling regions and merging the small ones | Rosenfeld and Pfaltz, *Sequential Operations in Digital Picture Processing*, JACM 1966 |
| 4 | Thinning a mask to a one-pixel skeleton | Zhang and Suen, *A Fast Parallel Algorithm for Thinning Digital Patterns*, CACM 27(3), 1984 |
| 6 | Following a region's boundary into a closed ring | Suzuki and Abe, *Topological Structural Analysis of Digitized Binary Images by Border Following*, CVGIP 30(1), 1985. Implemented as crack following on the lattice between pixels rather than walking pixel centres, so a loop closes by construction and a diagonal touch raises no question |
| 4 | Smoothing a polyline into a drawn stroke | Chaikin, *An Algorithm for High Speed Curve Generation*, 1974. Chaikin rather than Catmull-Rom: corner cutting keeps the line inside the shape it came from, where an interpolating spline overshoots at a sharp turn |
| 4 | Spur pruning and gap joining | No single paper; standard skeleton tidying, implemented from the definitions |
| 6 | Dropping points a curve does not need | Douglas and Peucker, *Algorithms for the Reduction of the Number of Points Required to Represent a Digitized Line or its Caricature*, Cartographica 10(2), 1973 |
| 6 | Fitting Bézier curves to a path | Schneider, *An Algorithm for Automatically Fitting Digitized Curves*, Graphics Gems I, 1990 |

## Dependencies

None added for any of this. The engine is TypeScript and typed arrays.

If that ever changes, the new dependency goes in `docs/lineartlab-log.md` with
its size and its licence, and the reason it was unavoidable.
