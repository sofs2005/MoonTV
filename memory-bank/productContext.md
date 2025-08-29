# Product Context

This file provides a high-level overview of the project and the expected product that will be created. Initially it is based upon projectBrief.md (if provided) and all other available project-related information in the working directory. This file is intended to be updated as the project evolves, and should be used to inform all other modes of the project's goals and context.
2025-08-28 14:09:50 - Log of updates made will be appended as footnotes to the end of this file.

*

## Project Goal

*   MoonTV is a ready-to-use, cross-platform video aggregation player. It aims to provide a seamless experience for users to enjoy a massive amount of free video content anytime, anywhere.

## Key Features

*   **Multi-source Aggregated Search**: Built-in support for dozens of free resource sites, returning results from all sources with a single search.
*   **Rich Detail Pages**: Displays complete information including episode lists, cast, year, and descriptions.
*   **Smooth Online Playback**: Integrated with HLS.js & ArtPlayer.
*   **Favorites + Continue Watching**: Supports Redis/D1/Upstash for storage, allowing progress synchronization across multiple devices.
*   **PWA (Progressive Web App)**: Enables offline caching and installation to desktop/home screen for a native-like mobile experience.
*   **Responsive Layout**: Adapts to various screen sizes with a desktop sidebar and mobile bottom navigation.
*   **Minimalist Deployment**: Can be fully deployed with a single Docker command or for free on Vercel and Cloudflare.
*   **Smart Ad Skipping**: Automatically skips sliced ads in videos (experimental).

## Overall Architecture

*   **Frontend Framework**: Next.js 14 (App Router)
*   **UI & Styling**: Tailwind CSS 3
*   **Language**: TypeScript 4
*   **Player**: ArtPlayer, HLS.js
*   **Code Quality**: ESLint, Prettier, Jest
*   **Deployment**: Docker, Vercel, Cloudflare Pages
*   **Data Storage**: Supports local storage, native Redis, Cloudflare D1, and Upstash Redis.