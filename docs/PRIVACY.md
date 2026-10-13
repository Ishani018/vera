# What leaves this computer

Short version: your work never does. One thing does, and only when you ask for
it: the words you type into **Browse free graphics**.

## Everything you make stays here

Books, covers, designs, stickers, drafts and the trash live in this browser's
own storage (IndexedDB, under the database name `versecraft`) and in no other
place. There is no account, no sign-in, and no server that holds any of it.
Clearing this browser's data for this site deletes all of it, and no copy
remains anywhere else.

Exports — PDFs, PNGs, zips, the sticker sheet, `CREDITS.txt` — are made in this
browser or by this app's own server process and go straight to your downloads.
They are not uploaded, stored or logged.

## The one thing that does leave: a graphics search

The Library page has **Browse free graphics**. When you search there, or press
one of the category chips:

- **Your search words** are sent to this app's server, which asks Wikimedia
  Commons — or the Smithsonian Open Access API, if a key has been set on the
  server — for matching pictures. The screen says so under the search box.
- **Nothing else goes with them.** Not an identifier, not a name, not anything
  you have made. The server sends only the search words and a User-Agent that
  names this app, which is what Wikimedia's API rules ask for.
- **The services see the request**, as they would any visitor to their site, and
  their own logs are their own business. Their terms:
  [Wikimedia](https://foundation.wikimedia.org/wiki/Policy:Privacy_policy),
  [Smithsonian](https://www.si.edu/termsofuse).
- **Pressing Add** asks this app's server to fetch that one picture, from an
  allow-list of two hosts (`upload.wikimedia.org`, `ids.si.edu`), over https
  only. The picture is handed back to this browser and saved here like anything
  else. Nothing about you goes out with that request.
- **Search answers are cached on the server for ten minutes**, by the words
  searched for, so that pressing the same chip twice asks the service once. The
  cache holds search words and the services' answers — nothing about who asked.

Not browsing means nothing is sent. The rest of the app does not use the
network at all.

## What the server is, and is not

The server builds pages, renders book PDFs for export, and makes those two
graphics requests. It keeps no database, writes no log of what you make, and
has nowhere to put it if it wanted to.

## Fonts

Typefaces are loaded from Google Fonts, which means Google's servers see that a
page was opened. This is a normal web-font request and carries nothing about
your work.

## Keys

The Smithsonian collection needs a free key from api.data.gov. It is read from
the `SMITHSONIAN_API_KEY` environment variable on the server, never written
into this repository, never sent to the browser, and never sent anywhere but
`api.si.edu`. With no key, that collection simply is not offered.

## Sign-in (optional)

If the host sets up Google sign-in, signing in shares your Google name, email address and
profile picture with this app, and nothing else. They are kept in a cookie in your browser,
signed so it cannot be altered. They are not stored on the server. Your books, pictures and
settings are still saved only in your browser and are never uploaded, signed in or not.
Signing out deletes the cookie. See `docs/DEPLOY-AUTH.md`.
