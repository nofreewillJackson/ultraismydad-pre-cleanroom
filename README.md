# (STALE) artluai — built with ai tracker(STALE)

Track everything you build with AI. Terminal-style project tracker with Firebase backend.

## Setup

1. Clone this repo
2. `npm install`
3. `npm run dev` to run locally
4. Push to GitHub → connect to Netlify for deploy

## Routes

- `/` — public homepage (anyone can see)
- `/admin` — dashboard (sign in with Google, admin only)
- `/journal` — journal entries list
- `/journal/:slug` — single journal entry permalink
- `/project/:slug` — single project permalink

## Stack

- React + Vite
- Firebase (Firestore + Auth + Analytics)
- Netlify (hosting)

## Features

- Public project table with expanded detail rows (info / live demo / files tabs)
- Firebase Auth (Google, admin only)
- MCP server so Claude can write directly to Firestore
- Live demo iframe embed (auto-detects netlify.app, vercel.app etc.)
- Terminal file browser (reads public GitHub repos via GitHub Contents API)
- Journal / blog section with dual authorship (ai + human)
- Drag and drop to reorder projects (admin only)
- Tag system with filtering on public view
- Individual project pages with permalinks

## Firestore Security Rules

Go to Firebase Console → Firestore → Rules, and paste:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /projects/{projectId} {
      // Anyone can read public projects
      allow read: if resource.data.visibility == "public";
      // Admin can read/write everything
      allow read, write: if request.auth != null
        && request.auth.token.email == "bitbrandsagency@gmail.com";
    }
    match /journal/{entryId} {
      allow read: if resource.data.visibility == "public";
      allow read, write: if request.auth != null
        && request.auth.token.email == "bitbrandsagency@gmail.com";
    }
    match /mainProjects/{projectId} {
      allow read: if resource.data.visibility == "public";
      allow write: if request.auth != null
        && request.auth.token.email == "bitbrandsagency@gmail.com";
    }
    match /series/{seriesId} {
      allow read: if resource.data.visibility == "public";
      allow write: if request.auth != null
        && request.auth.token.email == "bitbrandsagency@gmail.com";
    }
  }
}
```

## Firestore Indexes

You need composite indexes for the public queries.
Go to Firebase Console → Firestore → Indexes → Add Index:

**Projects (public query):**
- Collection: `projects`
- Fields: `visibility` (Ascending), `createdAt` (Descending)
- Query scope: Collection

**Projects (slug query):**
- Collection: `projects`
- Fields: `slug` (Ascending), `visibility` (Ascending)
- Query scope: Collection

**Journal (public query):**
- Collection: `journal`
- Fields: `visibility` (Ascending), `createdAt` (Descending)
- Query scope: Collection

Or just visit your site and check the browser console — Firebase will give you a direct link to create any needed index.
