---
tags: [flashcards, flashcards/pkm, learning, memory]
---
# Active Recall Flashcard Deck

Any note supports **inline**, **reversible**, **multi-line (`??` / `+++`)**, **cloze**, **code cloze**, **table**, and **image occlusion** cards. Card text can use **headings**, **bold** and <u>underline</u> like any other note.

## Multi-line Formatted Cards (`??` & `+++`)
+++
### How do multi-line NoSidian flashcards work?
Explain the **delimiter** and <u>card boundary</u> syntax.
??
### Multi-line Answer
Place **`??`** on its own line between Front & Back, and end each card with **`+++`**.
- Supports **bold**, *italic*, ==highlights==, and <u>underline</u>
- Supports nested lists, headings, code, images & audio
+++

## Core PKM Concepts
What is a Second Brain? :: A personal digital system for capturing, connecting, and retrieving ideas to produce new work. ^fc-2brain
Spaced Repetition ::: Reviewing material at increasing intervals just before forgetting occurs. ^fc-srs
Active Recall <> Retrieving information from memory rather than passively re-reading.

What keyboard shortcut opens Quick Switcher?
?
Press `Ctrl + O` (or `Cmd + O` on macOS) to jump instantly to any note in the vault. ^fc-qs

## Cloze Deletions & Code Cloze
Cosine similarity weighs {{c1::term frequency::TF}} against {{c2::inverse document frequency::IDF}} locally. <!-- extra: See [[Welcome to NoSidian]] for TF-IDF details. -->

Japanese term {記憶|きおく} means :: Memory / recollection (Furigana supported!)

```typescript
export function scheduleNext(stability: number, retrievability: number) {
  return stability * {{c1::Math.exp(1 - retrievability)}};
}
```

| Algorithm | Key Mechanism |
| --- | --- |
| SM-2 | Ease factor adjusted per rating |
| FSRS | Memory stability & difficulty model |

<!-- an-occlusion {"id":"occ-architecture","imageSrc":"","title":"PKM Knowledge Flow","mode":"hide-all-guess-one","boxes":[{"id":"box-capture","x":12,"y":28,"w":22,"h":24,"label":"Capture Notes","color":"#2563eb"},{"id":"box-connect","x":40,"y":28,"w":22,"h":24,"label":"Graph Links","color":"#0891b2"},{"id":"box-recall","x":68,"y":28,"w":22,"h":24,"label":"SRS Recall","color":"#10b981"}]} -->

Connected to [[Welcome to NoSidian]] and [[Second Brain Architecture]].
