# Privacy notice — Isnaevy demo

> ## This is a draft, and it is not ready to publish
>
> It was written by an AI assistant from general principles, not from current
> legal sources, and **no lawyer has read it**.
>
> **It is drafted against UK and EU law. It is not drafted for India.** If you
> are in India, or if people in India will use the demo, the **Digital Personal
> Data Protection Act, 2023** applies and this notice does not meet it — see
> [What is wrong for India](#what-is-wrong-for-india) at the end, which is
> specific about where it falls short. Two things in the text below are
> probably *wrong* under the DPDP Act, not merely thin: the lawful basis and
> the age threshold.
>
> Use this as a starting point to hand to a lawyer. Do not put it on a public
> site as it stands. The factual parts — what the software does with data — are
> accurate and were checked against the code; the legal framing is what needs
> the review.

_Last updated: [date]_ · _Contact: [your email address]_

---

## The short version

Isnaevy keeps your books, designs and pictures **in your own browser**. There
is no account, no sign-in, and no copy of your work on our side. We cannot see
what you are making.

The one exception is exporting. When you press **Download**, your pictures are
sent to the server so it can render the PDF or image, and are discarded as soon
as the file is made. Nothing is written to a disk that survives the request,
and nothing is kept afterwards.

## What stays on your computer

Your books, your designs, your sticker library, your uploaded pictures and your
settings are stored in your browser's own storage (IndexedDB and localStorage)
on the device you are using. They are never uploaded for safekeeping and never
synchronised between devices.

This means:

- **Clearing your browsing data deletes your work.** There is no backup on our
  side, so it cannot be recovered.
- **A private or incognito window forgets everything when you close it.**
- **Safari deletes storage for sites it has not seen for about seven days.**
  Other browsers may delete it if your disk gets full.
- We ask your browser to mark the site as persistent, which reduces the risk.
  Browsers decide whether to agree, and often refuse.

Use **Save a backup** on the front page. The file it writes contains everything
and lives on your computer, under your control.

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

- **Technical logs.** Your IP address, the time, the endpoint requested, the
  response status and size, and your browser's user-agent string. These exist
  to keep the service running and to stop one visitor using up the export
  capacity for everyone. Kept for **[14 days — must be confirmed against what
  the host actually does]**, then deleted.
- **Export rate limiting.** A count of recent exports against your IP address,
  held in memory for ten minutes and never written to disk.

Under UK and EU law our lawful basis for both would be **legitimate
interests** — running the service and preventing abuse. **This basis does not
exist under India's DPDP Act**; see the end of this notice.

## Cookies and analytics

**None.** No cookies are set, no analytics, no advertising, no trackers, no
third-party embeds for measurement. That is why you are not being asked to
accept anything.

Your browser's own storage, described above, is not a cookie and is not shared
with us or anyone else.

## Fonts

Typefaces come from **Google Fonts**.

- When you are **choosing or previewing a typeface**, your browser fetches the
  font files directly from Google, so Google receives your IP address and can
  see which fonts were requested. This is governed by
  [Google's privacy policy](https://policies.google.com/privacy).
- When you **export**, the *server* fetches the fonts and embeds them in your
  file. Your browser is not involved and your IP address is not sent to Google.

We plan to self-host the font files, which removes the first case entirely.
Until then, the font picker is the only place it happens.

## Who else sees your data

Nobody. There is no analytics provider, no advertising network and no other
processor. The service runs on **Fly.io**, which hosts the server and therefore
processes the technical logs above on our behalf; their data processing terms
apply. Servers are in **[region — fill in, e.g. London (lhr)]**.

We do not sell, share or transfer your data, because we do not hold it.

## Children

**[Unresolved — see the end of this notice.]** This tool is for people
publishing books and is not designed or intended for children. A UK/EU draft
would say 16. **India's DPDP Act defines a child as under 18 and requires
verifiable parental consent**, so a single sentence cannot be right for both
and this one has not been settled.

## Your rights

Under UK/EU law you have rights to access, correct, erase, restrict and object
to the processing of your personal data, and to complain to a supervisory
authority (in the UK, the [ICO](https://ico.org.uk/)). India's DPDP Act gives a
different, overlapping set, including a right to nominate someone to exercise
them — not described here, because this notice is not yet drafted for it.

In practice there is very little to exercise them against:

- **Your work** is on your computer. Delete it in the app or by clearing your
  browsing data; we cannot do it for you and cannot recover it.
- **There is no account** to close and no profile to download.
- For the technical logs, contact us at the address above. Because they are
  keyed only by IP address and kept a short time, we may need the approximate
  time and address before we can find anything.

## Changes

If this notice changes, the date at the top changes with it. There is no
mailing list to notify, because we do not have your email address.

---

# Demo disclaimer

**Isnaevy is a free demonstration, not a finished product.**

- **It may stop working, change, or disappear at any time, without notice.** It
  is one small server and there is no guarantee it will be running tomorrow.
- **Keep your own backups.** Your work is in your browser and nowhere else. Use
  **Save a backup** and keep the file somewhere you trust. If you lose your work
  because you did not, we cannot get it back.
- **Check your files before you spend money on them.** Isnaevy produces PDFs
  intended for Kindle Direct Publishing. Always download the file, open it, and
  use KDP's own previewer before ordering a proof or publishing. Trim sizes,
  bleed, spine width and margins are calculated from what you enter, and a
  mistake becomes a paid print run.
- **We are not responsible for printing costs**, rejected uploads, delays or
  lost sales arising from files made with this tool. Provided "as is", with no
  warranty of any kind, to the extent the law allows.
- **Your artwork is your responsibility.** Do not upload pictures you do not
  have the right to use. The line-art converter processes what you give it; it
  cannot tell whose it is. No part of this tool uses generative AI, so books
  made with it do not need an AI disclosure on KDP — but that is true of the
  *tool*, and says nothing about the pictures you bring to it.
- **Exports are rate limited** to five in ten minutes, so one visitor cannot
  take the server away from everyone else. "Print to PDF" in the export panel
  has no limit and runs in your browser.

---

## What is wrong for India

**The DPDP Act, 2023 is not a variation on the GDPR, and this notice cannot be
made compliant by editing a paragraph.** These are the specific problems, so
that a lawyer can start from something concrete:

1. **"Legitimate interests" does not exist.** The Act is built on consent plus
   a closed list of "legitimate uses". The lawful-basis sentence above is
   simply inapplicable, and the logging and rate limiting need to be placed
   under one of the listed uses or under consent.
2. **Consent has form requirements.** An itemised notice is required, and there
   are provisions about making the notice available in the languages of the
   Eighth Schedule. A single English page may not be enough.
3. **A Consent Manager regime exists**, and may bear on how consent must be
   collected and withdrawn.
4. **A child is anyone under 18**, with verifiable parental consent required,
   and restrictions on tracking and targeted advertising to children. The
   "Children" section above is not written to this.
5. **Breach notification** to the Data Protection Board is strict and appears
   to have no materiality threshold — so even a small incident may be
   notifiable, which is an operational commitment, not a wording change.
6. **Rights differ**, including the right to nominate another person to
   exercise them, which has no UK/EU equivalent and is not described above.
7. **Cross-border transfer** rules apply, and the server is in the UK/EU. Where
   the machine runs is therefore a compliance question, not just a latency one.

**I could not check any of this against current sources.** The Rules under the
Act were still being finalised as far as I know, and the Act's obligations and
their commencement dates are exactly the sort of thing that moves. Nothing
above should be relied on as a current statement of Indian law — it is a list
of places to look.

## Also worth a second opinion

- Whether the log retention period is stated accurately. **It must match what
  Fly.io actually does**, which needs checking against their current settings
  and terms. The figure above is a placeholder.
- Whether the liability disclaimer is enforceable where you live.
- Whether the Google Fonts position is good enough. A German court has found
  unconsented Google Fonts loading to breach the GDPR. Self-hosting the font
  files closes it, and is the recommendation.
- Whether UK/EU visitors need anything the draft above omits. It was written
  from general principles, not from current sources, and had no legal review.
