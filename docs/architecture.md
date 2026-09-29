# Isnaevy: two engines on one shared floor

The shape settled on 29 September 2026. Rationale in `DECISIONS.md`, detail in
`isnaevy-plan.md`.

The thing to hold on to: **covers, posts, posters and pins are one artboard with
objects placed on it. Book interiors are not.** Pagination — running heads, folios,
widows, a contents page carrying real page numbers — is a different machine, and it
is the part of this that a competitor cannot cheaply copy. It keeps its own engine.

What the two engines share is the floor beneath them: the asset store, the fonts,
undo, and the one carefully-tuned path from HTML through headless Chromium to a PDF
with real embedded font subsets and an exact page box.

```mermaid
flowchart TD
    subgraph shell["Isnaevy"]
        docs["documents · assets · templates"]
    end

    shell --> canvas
    shell --> flow

    subgraph canvas["CANVAS ENGINE — objects at x,y on a fixed board"]
        direction TB
        cgeom["geometry<br/>snap · resize · rotate · curve · bend"]
        cmodel["board = size + bleed + guides"]
        cgeom --- cmodel
    end

    subgraph flow["FLOW ENGINE — Paged.js pagination"]
        direction TB
        fpage["named pages · running heads<br/>folios · widows · recto breaks"]
        ftoc["contents with real page numbers"]
        fpage --- ftoc
    end

    canvas --> covers["KDP covers"]
    canvas --> kit["launch kit<br/>post · pin · postcard · bookmark"]
    flow --> poetry["poetry interiors"]
    flow --> coloring["colouring interiors"]

    covers --> floor
    kit --> floor
    poetry --> floor
    coloring --> floor

    subgraph floor["SHARED FLOOR"]
        direction LR
        assets["assets<br/>copy-on-use"]
        fonts["fonts<br/>Google Fonts subsets"]
        undo["undo<br/>one gesture, one step"]
        pipe["HTML → Chromium"]
    end

    floor --> printpdf["print PDF<br/>bleed · exact page box"]
    floor --> raster["PNG / JPG<br/>at a chosen DPI"]

    classDef engine fill:#eef3fb,stroke:#5b7fb8,stroke-width:1px
    classDef base fill:#f6f1e8,stroke:#b8935b,stroke-width:1px
    classDef out fill:#eaf5ee,stroke:#5ba874,stroke-width:1px
    class canvas,flow engine
    class floor base
    class printpdf,raster out
```

## Reading it

- **Both engines produce HTML.** That is the seam. Everything below the seam is
  shared and everything above it is free to differ. The canvas engine writes
  absolutely-positioned objects; the flow engine writes a document and lets
  Paged.js break it into pages. Neither has to know about the other.
- **The raster target is new** and is the only genuinely new thing in the export
  path: `page.screenshot` with `deviceScaleFactor = dpi / 96`, roughly thirty lines
  on top of the browser service that already exists.
- **A mode is thin.** It supplies board presets, guides (the spine and the barcode
  reserve come from here) and rules ("under 300 DPI", "crosses the spine"). `kdp.ts`
  stays exactly as it is and becomes one mode's rule source rather than a global
  truth.
- **Nothing crosses sideways.** The canvas engine never imports from the flow engine
  or the reverse. If that edge ever appears, something has been modelled wrong.
