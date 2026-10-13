'use client';

import { useEffect, useMemo, useState } from 'react';
import { getAsset, getAssetUrl } from '@/lib/assets';
import { listStickers, updateSticker } from '@/lib/cover/library';
import {
  fileNames,
  inPack,
  packTag,
  packsIn,
  plainTags,
  withPack,
  withoutPack,
} from '@/lib/stickers/packs';
import { makeZip } from '@/lib/stickers/zip';
import { installPack, summarise } from '@/lib/starter/installClient';
import { planRemoval, type ItemOutcome } from '@/lib/starter/install';
import { removeSticker } from '@/lib/cover/library';
import { Modal } from '../Modal';
import type { LibrarySticker } from '@/lib/types';
import { StudioHeader, StudioTitle } from '../StudioHeader';
import { PalettePicker } from '../PalettePicker';
import { StickerTabs } from './StickerTabs';
import { Fan, Thumb } from './Thumb';
import { PlusIcon, TickIcon } from './icons';
import { Button, Notice, TextInput, cx } from '../ui';
import { CARD, COLUMN, PageHead, StudioPage, cardHover, cardStyle } from '../studio/Shell';

/**
 * Packs: a named group of stickers, and a zip of them.
 *
 * A pack is a tag — `pack:autumn` — rather than a table, which is what lets it
 * exist at all without a database version bump. Two things follow, and the
 * screen says both: an empty pack is not a thing, because there is nothing to
 * hold it; and renaming one retags every sticker in it, which is a real edit
 * rather than a label change.
 *
 * Private and local throughout. Nothing is shared, nothing is browsable, and a
 * pack leaves this browser only as a zip somebody downloads.
 */
export function StickerPacks() {
  const [stickers, setStickers] = useState<LibrarySticker[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [chosen, setChosen] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [installing, setInstalling] = useState<{ done: number; total: number; name: string } | null>(null);
  const [failures, setFailures] = useState<ItemOutcome[]>([]);
  const [removing, setRemoving] = useState<string | null>(null);

  /**
   * Installing a pack somebody added themselves.
   *
   * It only ever adds. Nothing already in the library is written over or
   * removed, a second install of the same pack skips what is there rather than
   * making a second copy, and one picture that will not open does not stop the
   * rest — which is said in the summary rather than swallowed.
   */
  const install = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setSaid(null);
    setProblem(null);
    setFailures([]);
    setInstalling({ done: 0, total: 0, name: file.name });
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = await installPack(bytes, setInstalling);
      const count = summarise(result.outcomes);
      await reload();
      setChosen(result.pack);
      setFailures(result.outcomes.filter((o) => o.state === 'failed'));
      setSaid(
        `${result.name}: ${count.installed} installed` +
          (count.skipped ? `, ${count.skipped} already here` : '') +
          (count.failed ? `, ${count.failed} could not be read` : '') +
          '.',
      );
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'That pack could not be installed.');
    } finally {
      setInstalling(null);
      setBusy(false);
    }
  };

  const reload = async () => setStickers(await listStickers());
  useEffect(() => {
    void reload();
  }, []);

  useEffect(() => {
    let live = true;
    void Promise.all(
      stickers.map(async (sticker) => [sticker.id, await getAssetUrl(sticker.assetId)] as const),
    ).then((pairs) => {
      if (!live) return;
      const next: Record<string, string> = {};
      for (const [id, url] of pairs) if (url) next[id] = url;
      setUrls(next);
    });
    return () => {
      live = false;
    };
  }, [stickers]);

  const packs = useMemo(() => packsIn(stickers), [stickers]);

  const make = async () => {
    const tag = packTag(newName);
    if (!tag) {
      setProblem('Give the pack a name first.');
      return;
    }
    // A pack with nothing in it has nowhere to live, so making one is choosing
    // its name and the first sticker goes in next. The screen says so.
    setChosen(tag.slice('pack:'.length));
    setNewName('');
    setProblem(null);
    setSaid(`Ready. Add stickers to ${tag.slice('pack:'.length)} below.`);
  };

  /**
   * Removing a pack, which takes away less than its name suggests on purpose.
   *
   * Only what came from the pack, only what is still as the pack left it, and
   * never something you have since put in another pack. Everything it takes
   * goes to the trash for thirty days like anything else, so a mistake here
   * costs a trip to the Trash screen rather than the work itself.
   */
  const remove = async (pack: string) => {
    setBusy(true);
    setSaid(null);
    setProblem(null);
    try {
      const plan = planRemoval(stickers, pack);
      for (const sticker of plan.remove) await removeSticker(sticker.id);
      await reload();
      setRemoving(null);
      const kept = plan.keep.map((k) => `${k.sticker.name} (${k.because})`);
      setSaid(
        `${pack}: ${plan.remove.length} moved to the trash` +
          (kept.length ? `. Kept ${kept.join(', ')}` : '') +
          '.',
      );
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'That pack could not be removed.');
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (sticker: LibrarySticker) => {
    const pack = chosen;
    if (!pack) return;
    const tags = inPack(sticker, pack)
      ? withoutPack(sticker.tags ?? [], pack)
      : withPack(sticker.tags ?? [], pack);
    await updateSticker(sticker.id, { tags });
    await reload();
  };

  const download = async (pack: string) => {
    const members = stickers.filter((sticker) => inPack(sticker, pack));
    if (!members.length) return;
    setBusy(true);
    setSaid(null);
    setProblem(null);
    try {
      const names = fileNames(members.map((one) => one.name));
      const entries: { name: string; bytes: Uint8Array }[] = [];
      for (const [n, sticker] of members.entries()) {
        const asset = await getAsset(sticker.assetId);
        if (!asset) continue;
        entries.push({ name: names[n], bytes: new Uint8Array(await asset.blob.arrayBuffer()) });
      }
      if (!entries.length) throw new Error('None of these stickers still has a picture.');

      const zip = makeZip(entries);
      const url = URL.createObjectURL(zip);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${pack}-pack.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setSaid(
        `Saved ${entries.length} ${entries.length === 1 ? 'sticker' : 'stickers'} as ` +
          `${pack}-pack.zip (${(zip.size / 1024 / 1024).toFixed(2)} MB).`,
      );
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'That pack could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const installer = (
    <label
      className={cx(
        'cursor-pointer rounded-lg border border-ink-200 px-3 py-1.5 text-[13.5px] font-[560] transition-colors hover:border-ink-400',
        busy && 'pointer-events-none opacity-50',
      )}
    >
      Install a pack…
      <input
        type="file"
        accept=".zip,application/zip"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Cleared so that choosing the *same* file again counts as a change.
          // Without this, installing a pack, removing it and picking the same
          // zip does nothing at all, which looks like a broken button rather
          // than a browser rule.
          e.target.value = '';
          void install(file);
        }}
      />
    </label>
  );

  /** Everything the page might have to say, wherever it is standing. */
  const notices = (
    <>
      {installing && (
        <p className="mt-3 text-[13px] text-ink-500">
          {installing.total
            ? `Installing ${installing.done} of ${installing.total} — ${installing.name}…`
            : `Reading ${installing.name}…`}
        </p>
      )}
      {problem && (
        <div className="mt-3 max-w-xl">
          <Notice level="error">{problem}</Notice>
        </div>
      )}
      {failures.length > 0 && (
        <div className="mt-3 max-w-xl">
          <Notice level="warning">
            {failures.map((f) => `${f.file}: ${'why' in f ? f.why : 'could not be read'}`).join(' · ')}
          </Notice>
        </div>
      )}
      {said && (
        <div className="mt-3 max-w-xl">
          <Notice level="ok">{said}</Notice>
        </div>
      )}
    </>
  );

  const open = chosen ?? null;
  const inside = open ? stickers.filter((sticker) => inPack(sticker, open)) : [];
  const outside = open ? stickers.filter((sticker) => !inPack(sticker, open)) : [];
  const openPack = packs.find((pack) => pack.name === open) ?? null;
  const installed = (name: string) =>
    stickers.some((sticker) => sticker.source?.pack === name && !sticker.deletedAt);

  /** Dropping a sticker onto a pack is the same as pressing it. */
  const dropped = (event: React.DragEvent) => {
    event.preventDefault();
    const id = event.dataTransfer.getData('application/x-versecraft-sticker-id');
    const sticker = stickers.find((one) => one.id === id);
    if (sticker && open && !inPack(sticker, open)) void toggle(sticker);
  };

  return (
    <main className="flex h-dvh flex-col">
      <StudioHeader>
        <StudioTitle>Sticker Studio</StudioTitle>
        <span className="ml-auto flex shrink-0 items-center gap-3 self-stretch">
          <span className="flex items-stretch self-stretch">
            <StickerTabs />
          </span>
          <PalettePicker compact />
        </span>
      </StudioHeader>

      <StudioPage>
        <div className={`${COLUMN} py-9`}>
          {open === null ? (
            <>
              {/*
                The name and the button that uses it, on the same line as the
                heading. Making a pack is the only thing this screen asks for,
                so it is a field and a button rather than a card at the end of
                the gallery you have to find first.
              */}
              {/* One line. What a pack actually is lives in the tooltips on
                  the cards, where it is read at the moment it matters. */}
              <PageHead
                title="Packs"
                line="Group stickers, then download them as a zip."
                size="hero"
              >
                <div className="flex flex-wrap items-center gap-2.5">
                  {installer}
                  <TextInput
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    aria-label="A name for a new pack"
                    placeholder="Name a new pack"
                    /* 435 by 91 on the mockup's 1738px window, so 290 by 60. */
                    className="!w-[290px] !rounded-[8px] !py-3"
                    style={{ fontSize: 'var(--studio-text-body)' }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void make();
                    }}
                  />
                  <Button
                    variant="create"
                    className="!px-6 !py-3"
                    style={{ fontSize: 'var(--studio-text-body)' }}
                    onClick={() => void make()}
                  >
                    Start a pack
                  </Button>
                </div>
              </PageHead>

              {notices}

              {/*
                Four across on a desktop, two on a tablet, one on a phone — the
                mockup's own grid. It was three because at the old column width
                a quarter was 230px and the collage stopped saying which pack
                this is. With the column at its drawn width a quarter is 270,
                which is wide enough.
              */}
              <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {packs.map((pack) => (
                  <div
                    key={pack.tag}
                    className={`proof ${CARD} ${cardHover} group flex flex-col p-3.5`}
                    style={cardStyle}
                  >
                    <button
                      type="button"
                      title={`Open ${pack.name} — ${pack.stickerIds.length} stickers · a pack is a tag on each sticker, so nothing is ever copied`}
                      onClick={() => setChosen(pack.name)}
                      className="block text-left"
                    >
                      <Fan
                        urls={pack.stickerIds.map((id) => urls[id])}
                        name={pack.name}
                        className="transition-colors group-hover:border-accentb-500"
                      />
                      <span
                        className="mt-3 block truncate tracking-tight"
                        style={{
                          fontFamily: 'var(--font-display)',
                          fontWeight: 600,
                          fontSize: 'var(--studio-text-section)',
                          color: 'var(--color-ink-900)',
                        }}
                      >
                        {pack.name}
                      </span>
                      <span className="mono-label mt-1 block text-ink-500" style={{ fontSize: 11 }}>
                        {pack.stickerIds.length}{' '}
                        {pack.stickerIds.length === 1 ? 'sticker' : 'stickers'}
                      </span>
                    </button>
                    {/*
                      Both actions are always on the card, not revealed on
                      hover. A phone has no hover, and an action nobody can see
                      is an action nobody uses.
                    */}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button
                        variant="default"
                        disabled={busy}
                        title="A zip of its pictures, saved to your downloads"
                        onClick={() => void download(pack.name)}
                      >
                        Download zip
                      </Button>
                      <Button onClick={() => setChosen(pack.name)}>Open</Button>
                      {installed(pack.name) && (
                        <Button
                          disabled={busy}
                          title="Takes away only what came from this pack and has not been changed"
                          onClick={() => setRemoving(pack.name)}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  </div>
                ))}

                {/* One more card in the same grid, so making a pack reads as
                    one more pack rather than as a form somewhere else. */}
                <button
                  type="button"
                  title="Name it above, then press stickers to put them in"
                  onClick={() => void make()}
                  className="flex min-h-[260px] flex-col items-center justify-center gap-2.5 rounded-[10px] border border-dashed p-3 transition-colors hover:border-accentb-500"
                  style={{ color: 'var(--color-accentb-700)', borderColor: 'var(--studio-line)' }}
                >
                  <PlusIcon size={34} />
                  <span
                    className="tracking-tight"
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontWeight: 600,
                      fontSize: 'var(--studio-text-section)',
                    }}
                  >
                    New pack
                  </span>
                </button>
              </div>

              {!stickers.length && (
                <p
                  className="mt-6"
                  style={{ fontSize: 'var(--studio-text-body)', color: 'var(--color-ink-500)' }}
                >
                  Nothing to group yet. Make a sticker first.
                </p>
              )}
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setChosen(null)}
                  className="text-[13px] text-accent-500 underline"
                >
                  ← All packs
                </button>
                <h1 className="display text-[22px] tracking-tight">{open}</h1>
                <span className="text-[13px] text-ink-500">
                  {inside.length} {inside.length === 1 ? 'sticker' : 'stickers'}
                </span>
                <span className="ml-auto flex flex-wrap gap-1.5">
                  <Button
                    disabled={busy || !inside.length}
                    title="A zip of its pictures, saved to your downloads"
                    onClick={() => void download(open)}
                  >
                    Export zip
                  </Button>
                  {installed(open) && (
                    <Button
                      disabled={busy}
                      title="Takes away only what came from this pack and has not been changed"
                      onClick={() => setRemoving(open)}
                    >
                      Remove this pack
                    </Button>
                  )}
                </span>
              </div>

              {notices}

              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={dropped}
                className="mt-4 min-h-[8rem] rounded-2xl border border-dashed border-ink-200 p-3"
              >
                {inside.length ? (
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-6">
                    {inside.map((sticker) => (
                      <Thumb
                        key={sticker.id}
                        url={urls[sticker.id]}
                        name={sticker.name}
                        note={plainTags(sticker.tags ?? []).join(', ') || '—'}
                        title={`${sticker.name} — press to take it out of ${open}`}
                        selected
                        onClick={() => void toggle(sticker)}
                        badge={
                          <span className="pointer-events-none absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-accent-500 text-paper shadow">
                            <TickIcon size={12} />
                          </span>
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <p className="py-6 text-center text-[13.5px] text-ink-500">
                    Nothing in {open} yet. Press one below, or drag it here.
                  </p>
                )}
              </div>

              {outside.length > 0 && (
                <section className="mt-6">
                  <span className="block text-[14px] font-[600]">
                    Add stickers
                    <span className="ml-2 font-normal text-[12.5px] text-ink-500">
                      press one, or drag it up
                    </span>
                  </span>
                  <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-6">
                    {outside.map((sticker) => (
                      <Thumb
                        key={sticker.id}
                        url={urls[sticker.id]}
                        name={sticker.name}
                        note={plainTags(sticker.tags ?? []).join(', ') || '—'}
                        title={`${sticker.name} — press to put it in ${open}`}
                        onClick={() => void toggle(sticker)}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('application/x-versecraft-sticker-id', sticker.id);
                          e.dataTransfer.effectAllowed = 'copy';
                        }}
                      />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          {removing && (
            <Modal title={`Remove ${removing}?`} onClose={() => setRemoving(null)} width="max-w-md">
              {(() => {
                const plan = planRemoval(stickers, removing);
                return (
                  <>
                    <p className="text-[14.5px] leading-relaxed">
                      {plan.remove.length === 0
                        ? 'Nothing would be removed.'
                        : plan.remove.length === 1
                          ? 'One sticker goes to the trash, where it stays for thirty days.'
                          : `${plan.remove.length} stickers go to the trash, where they stay for thirty days.`}
                    </p>
                    {plan.keep.length > 0 && (
                      <ul className="mt-3 list-disc space-y-1 pl-5 text-[13.5px] text-ink-500">
                        {plan.keep.map((k) => (
                          <li key={k.sticker.id}>
                            <span className="font-[560] text-ink-700">{k.sticker.name}</span> stays —{' '}
                            {k.because}.
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-5 flex flex-wrap justify-end gap-2">
                      <Button onClick={() => setRemoving(null)}>Keep it</Button>
                      <Button
                        variant="primary"
                        disabled={busy || plan.remove.length === 0}
                        onClick={() => void remove(removing)}
                      >
                        Remove {plan.remove.length}
                      </Button>
                    </div>
                  </>
                );
              })()}
            </Modal>
          )}
        </div>
      </StudioPage>
    </main>
  );
}
