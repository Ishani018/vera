# Privacy notice — Isnaevy demo

**Draft. Not legal advice, and not reviewed by a lawyer.** See *Still to be
checked* at the end, which matters if you are in India.

_Last updated: [date]_ · _Contact: [your email address]_

## The short version

Isnaevy keeps your books, designs and pictures **in your own browser**. There
is no account, no sign-in, and no copy of your work on our side. We cannot
see what you are making.

The one exception is exporting. When you press **Download**, your pictures are
sent to the server so it can render the PDF or image, and are discarded as
soon as the file is made. Nothing is written to a disk that survives the
request, and nothing is kept afterwards.

## What stays on your computer

Your books, your designs, your sticker library, your uploaded pictures and
your settings are stored in your browser's own storage (IndexedDB and
localStorage) on the device you are using. They are never uploaded for
safekeeping and never synchronised between devices.

This means:

- **Clearing your browsing data deletes your work.** There is no backup on our
  side, so it cannot be recovered.
- **A private or incognito window forgets everything when you close it.**
- **Safari deletes storage for sites it has not seen for about seven days.**
  Other browsers may delete it if your disk gets full.
- We ask your browser to mark the site as persistent, which reduces the risk.
  Browsers decide whether to agree and often refuse.

Use **Save a backup** on the front page. The file it writes contains
everything and lives on your computer, under your control.

## What happens when you press Download

To make a print-ready PDF the server runs a real browser engine and needs the
actual pictures. So on Download, and only on Download:

1. Your book or design, and the pictures in it, are sent to our server.
2. The server renders the file in memory and sends it back to you.
3. The data is discarded. It is not written to persistent storage, not logged,
   and not used for anything else.

If you would rather nothing left your browser at all, use **Print to PDF** in
the export panel. It renders the same document in your own browser and sends
nothing to us.

## What the server records

- **Technical logs.** Your IP address, the time, the page or endpoint
  requested, the response status and size, and your browser's user-agent
  string. These exist to keep the service running and to stop one visitor
  using up the export capacity for everyone. Kept for **14 days**, then
  deleted.
- **Export rate limiting.** A count of recent exports against your IP address,
  held in memory for ten minutes and never written to disk.

Under UK and EU data protection law our lawful basis for both is **legitimate
interests** — running the service and preventing abuse.

## Cookies and analytics

**None.** No cookies are set, no analytics, no advertising, no trackers, no
third-party embeds for measurement. That is why you are not being asked to
accept anything.

Your browser's own storage (described above) is not a cookie and is not shared
with us or anyone else.

## Fonts

Typefaces come from **Google Fonts**.

- When you are **choosing or previewing a typeface**, your browser fetches the
  font files directly from Google, which means Google receives your IP address
  and can see which fonts were requested. This is governed by
  [Google's privacy policy](https://policies.google.com/privacy).
- When you **export**, the *server* fetches the fonts and embeds them in your
  file. Your browser is not involved and your IP address is not sent to Google.

We plan to self-host the font files, which removes the first case entirely. If
you would rather avoid it in the meantime, the font picker is the only place it
happens.

## Who else sees your data

Nobody. There is no analytics provider, no advertising network and no other
processor. The service runs on **Fly.io**, which hosts the server and
therefore processes the technical logs above on our behalf; their data
processing terms apply. Servers are in [region, e.g. London (lhr)].

We do not sell, share or transfer your data, because we do not hold it.

## Children

This tool is for people publishing books and is not designed or intended for
children. Please do not use it if you are under 16.

## Your rights

Under UK/EU data protection law you have rights to access, correct, erase,
restrict and object to the processing of your personal data, and to complain
to a supervisory authority (in the UK, the [ICO](https://ico.org.uk/)).

In practice there is very little to exercise them against:

- **Your work** is on your computer. Delete it by deleting it in the app or
  clearing your browsing data; we cannot do it for you and cannot recover it.
- **There is no account** to close and no profile to download.
- For the technical logs, contact us at the address above. Because the logs are
  keyed only by IP address and kept 14 days, we may need you to tell us the
  approximate time and address before we can find anything.

## Changes

If this notice changes, the date at the top changes with it. There is no
mailing list to notify, because we do not have your email address.

---

# Demo disclaimer

**Isnaevy is a free demonstration, not a finished product.**

- **It may stop working, change, or disappear at any time, without notice.**
  It is one small server and there is no guarantee it will be running
  tomorrow.
- **Keep your own backups.** Your work is in your browser and nowhere else.
  Use **Save a backup** and keep the file somewhere you trust. If you lose your
  work because you did not, we cannot get it back.
- **Check your files before you spend money on them.** Isnaevy produces PDFs
  intended for Kindle Direct Publishing. Always download the file, open it,
  and use KDP's own previewer before ordering a proof or publishing. Trim
  sizes, bleed, spine width and margins are calculated from what you enter,
  and a mistake becomes a paid print run.
- **We are not responsible for printing costs**, rejected uploads, delays or
  lost sales arising from files made with this tool. Provided "as is", with no
  warranty of any kind, to the extent the law allows.
- **Your artwork is your responsibility.** Do not upload pictures you do not
  have the right to use. The line-art converter processes what you give it; it
  cannot tell whose it is. No part of this tool uses generative AI, so books
  made with it do not need an AI disclosure on KDP — but that is only true of
  the *tool*, and says nothing about the pictures you bring to it.
- **Exports are rate limited** to five in ten minutes, so that one visitor
  cannot take the server away from everyone else. "Print to PDF" in the export
  panel has no limit and runs in your browser.

---

## Still to be checked

**Indian data-protection law needs a proper review before this goes public,
and I could not do it here.** If you are in India, or if visitors from India
are expected, the **Digital Personal Data Protection Act, 2023 (DPDP Act)**
very likely applies, and it does not work like UK/EU law:

- **There is no "legitimate interests" basis.** The DPDP Act is built around
  consent plus a short list of "legitimate uses", and the consent requirements
  are specific — including an itemised notice and, in some readings, an option
  to receive it in the languages of the Eighth Schedule. The lawful-basis
  paragraph above is written for UK/EU law and may simply not transfer.
- **A "Consent Manager" regime** exists and may bear on how consent is to be
  collected.
- **Children are defined as under 18**, not 13 or 16, and processing their
  data requires verifiable parental consent. The "under 16" line above is
  probably wrong for India.
- **Breach notification duties** to the Data Protection Board are strict and
  have no obvious materiality threshold.
- **The Rules under the Act were still being finalised** as of my information,
  and the obligations that follow from them — and their commencement dates —
  are the part most likely to have moved.

I have no way to check the current text, the Rules, or their commencement from
this session, and this is exactly the kind of thing that changes. **Have a
lawyer who practises Indian data-protection law read this before the demo is
public.** The same review should confirm whether anything here needs to change
for UK/EU visitors, which I have drafted from general principles and not from
current sources.

Other things worth a second opinion:

- Whether the fourteen-day log retention is stated accurately — **it must match
  what Fly.io actually does**, which needs checking against their current
  settings and terms.
- Whether the liability disclaimer is enforceable where you live.
- Whether the Google Fonts position is good enough, given a German court has
  found unconsented Google Fonts loading to breach the GDPR. Self-hosting the
  font files would close it, and is the recommendation.
