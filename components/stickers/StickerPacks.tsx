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
import { StudioHeader } from '../StudioHeader';
import { StickerTabs } from './StickerTabs';
import { Thumb } from './Thumb';
import { TickIcon } from './icons';
import { Button, Notice, TextInput, cx } from '../ui';

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
  const open = chosen ?? packs[0]?.name ?? null;
  const inside = stickers.filter((s) => open && inPack(s, open));

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
    if (!open) return;
    const tags = inPack(sticker, open)
      ? withoutPack(sticker.tags ?? [], open)
      : withPack(sticker.tags ?? [], open);
    await updateSticker(sticker.id, { tags });
    await reload();
  };

  const download = async () => {
    if (!open || !inside.length) return;
    setBusy(true);
    setSaid(null);
    setProblem(null);
    try {
      const names = fileNames(inside.map((s) => s.name));
      const entries: { name: string; bytes: Uint8Array }[] = [];
      for (const [n, sticker] of inside.entries()) {
        const asset = await getAsset(sticker.assetId);
        if (!asset) continue;
        entries.push({ name: names[n], bytes: new Uint8Array(await asset.blob.arrayBuffer()) });
      }
      if (!entries.length) throw new Error('None of these stickers still has a picture.');

      const zip = makeZip(entries);
      const url = URL.createObjectURL(zip);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${open}-pack.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setSaid(
        `Saved ${entries.length} ${entries.length === 1 ? 'sticker' : 'stickers'} as ` +
          `${open}-pack.zip (${(zip.size / 1024 / 1024).toFixed(2)} MB).`,
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

  return (
    <main className="flex h-dvh flex-col">
      <StudioHeader>
        <span className="text-[16px] font-[560]">Sticker packs</span>
        <span className="ml-auto shrink-0 text-[13px] text-ink-500">kept on this computer only</span>
      </StudioHeader>

      <StickerTabs />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
          {!stickers.length ? (
            <div className="mt-6">
              <h1 className="text-[26px] font-semibold tracking-tight">Nothing to group yet</h1>
              <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-ink-500">
                A pack is made from the stickers in My stickers. Make a few in the studio and save
                them, then come back — or install a pack of stickers you already have.
              </p>
              {/* Installing is how an empty library stops being empty, so it
                  cannot be the one thing an empty library does not offer. */}
              <div className="mt-4 flex flex-wrap items-center gap-2">{installer}</div>
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
            </div>
          ) : (
            <>
              <h1 className="mt-6 text-[26px] font-semibold tracking-tight">Packs</h1>
              <p className="mt-2 max-w-2xl text-[14.5px] leading-relaxed text-ink-500">
                A pack is a tag on each sticker in it, which is why a sticker can be in two packs at
                once and why deleting one cannot leave a pack pointing at nothing. It also means a
                pack with nothing in it does not exist, and renaming one is really retagging every
                sticker in it.
              </p>
              <p className="mt-1 text-[13px] text-ink-500">
                Installing a pack only ever adds: nothing you already have is written over or
                removed, and installing the same pack twice adds nothing the second time.{' '}
                All of this stays on this computer. Nothing is shared and nothing is browsable by
                anyone else; a pack leaves here only as a zip you download.
              </p>

              <div className="mt-5 flex flex-wrap items-center gap-2">
                {packs.map((pack) => (
                  <button
                    key={pack.tag}
                    type="button"
                    aria-pressed={open === pack.name}
                    onClick={() => setChosen(pack.name)}
                    className={cx(
                      'rounded-lg border px-3 py-1.5 text-[13.5px] transition-colors',
                      open === pack.name
                        ? 'border-accent-500 bg-accent-50'
                        : 'border-ink-200 hover:border-ink-300',
                    )}
                  >
                    <span className="font-[560]">{pack.name}</span>
                    <span className="ml-2 text-ink-500">{pack.stickerIds.length}</span>
                  </button>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <TextInput
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  aria-label="A name for a new pack"
                  placeholder="A name for a new pack"
                  className="max-w-xs"
                />
                <Button onClick={() => void make()}>Start a pack</Button>
                {installer}
                {open && inside.length > 0 && (
                  <>
                    <Button variant="primary" disabled={busy} onClick={() => void download()}>
                      Download {open} as a zip
                    </Button>
                    {inside.some((sticker) => sticker.source?.pack === open) && (
                      <Button disabled={busy} onClick={() => setRemoving(open)}>
                        Remove this pack
                      </Button>
                    )}
                  </>
                )}
              </div>

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
                    {failures
                      .map((f) => `${f.file}: ${'why' in f ? f.why : 'could not be read'}`)
                      .join(' · ')}
                  </Notice>
                </div>
              )}
              {said && (
                <div className="mt-3 max-w-xl">
                  <Notice level="ok">{said}</Notice>
                </div>
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
                                <span className="font-[560] text-ink-700">{k.sticker.name}</span> stays
                                — {k.because}.
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

              {open && (
                <div className="mt-6">
                  <span className="block font-[570]">
                    What is in {open} — press one to put it in or take it out
                  </span>
                  <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-5">
                    {stickers.map((sticker) => {
                      const member = inPack(sticker, open);
                      return (
                        <Thumb
                          key={sticker.id}
                          url={urls[sticker.id]}
                          name={sticker.name}
                          note={member ? 'in this pack' : plainTags(sticker.tags ?? []).join(', ') || '—'}
                          title={`${sticker.name} — press to ${member ? 'take it out of' : 'put it in'} ${open}`}
                          selected={member}
                          onClick={() => void toggle(sticker)}
                          badge={
                            member ? (
                              <span className="pointer-events-none absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-accent-500 text-paper shadow">
                                <TickIcon size={12} />
                              </span>
                            ) : null
                          }
                        />
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
