---
title: "Wikilinks and Backlinks"
description: "How notes link to each other, and how the graph and linked-mentions are derived."
date: "2026-06-11"
tags: ["garden", "obsidian/markdown"]
aliases: ["Backlinks", "Linked Mentions"]
---

Notes link with double brackets: `[[On Static Sites]]`. You can alias the text with a pipe —
`[[On Static Sites|why static?]]` → [[On Static Sites|why static?]] — and link straight to a
heading with `[[Note#Heading]]`.

A link to a note that doesn't exist yet renders as [[Some Future Note]] (unresolved, dimmed)
— Obsidian shows these the same way, as an invitation to write them.

## A Linkable Heading

This heading can be targeted directly, e.g. `[[Wikilinks and Backlinks#A Linkable Heading]]`,
and it can also be **transcluded** as a section into another note.

This specific paragraph carries a block id, so it can be linked or embedded on its own. ^anchor

## Backlinks

Every note collects its inbound links automatically. Because [[Welcome to the Garden]] and
[[Markdown Feature Tour]] both point here, this note lists them under *linked mentions*.
