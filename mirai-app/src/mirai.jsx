import { useState, useEffect, useRef, useCallback } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// AniList GraphQL API
// ─────────────────────────────────────────────────────────────────────────────
const ANILIST_URL = "https://graphql.anilist.co";

async function anilistQuery(query, variables = {}) {
  const res = await fetch(ANILIST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0].message);
  return json.data;
}

const MEDIA_FIELDS = `
  id
  title { romaji english native }
  coverImage { large extraLarge color }
  bannerImage
  averageScore
  meanScore
  popularity
  favourites
  genres
  tags { name rank isMediaSpoiler }
  description(asHtml: false)
  startDate { year month day }
  endDate { year }
  episodes
  duration
  status
  format
  source
  season
  seasonYear
  studios(isMain: true) { nodes { id name siteUrl } }
  externalLinks { site url color icon }
  trailer { id site }
  nextAiringEpisode { episode airingAt }
`;

const MEDIA_FIELDS_BRIEF = `
  id
  title { romaji english }
  coverImage { large extraLarge color }
  bannerImage
  averageScore
  genres
  description(asHtml: false)
  startDate { year }
  episodes
  status
  format
`;

// Mood → AniList genre mapping
const MOOD_GENRE_MAP = {
  "EPIC":           "Action",
  "EVERYDAY CALM":  "Slice of Life",
  "EMOTIONAL DEPTH":"Drama",
  "MYSTERY":        "Mystery",
  "WONDER":         "Fantasy",
  "DARK MATTER":    "Psychological",
  "COMEDY":         "Comedy",
  "ROMANCE":        "Romance",
};

async function fetchByGenre(genre, page = 1, perPage = 20) {
  const query = `
    query ($genre: String, $page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        media(genre: $genre, sort: SCORE_DESC, type: ANIME, isAdult: false) {
          ${MEDIA_FIELDS_BRIEF}
        }
      }
    }
  `;
  const data = await anilistQuery(query, { genre, page, perPage });
  return data.Page.media;
}

async function fetchByGenres(genres, perPage = 24) {
  const query = `
    query ($genres: [String], $perPage: Int) {
      Page(page: 1, perPage: $perPage) {
        media(genre_in: $genres, sort: SCORE_DESC, type: ANIME, isAdult: false) {
          ${MEDIA_FIELDS_BRIEF}
        }
      }
    }
  `;
  const data = await anilistQuery(query, { genres, perPage });
  return data.Page.media;
}

async function searchAnime(search, perPage = 20) {
  const query = `
    query ($search: String, $perPage: Int) {
      Page(page: 1, perPage: $perPage) {
        media(search: $search, type: ANIME, isAdult: false, sort: SEARCH_MATCH) {
          ${MEDIA_FIELDS_BRIEF}
        }
      }
    }
  `;
  const data = await anilistQuery(query, { search, perPage });
  return data.Page.media;
}

async function fetchPopular(perPage = 20) {
  const query = `
    query ($perPage: Int) {
      Page(page: 1, perPage: $perPage) {
        media(sort: POPULARITY_DESC, type: ANIME, isAdult: false) {
          ${MEDIA_FIELDS_BRIEF}
        }
      }
    }
  `;
  const data = await anilistQuery(query, { perPage });
  return data.Page.media;
}

// NEW: Trending anime (updated each hour by AniList)
async function fetchTrending(perPage = 16) {
  const query = `
    query ($perPage: Int) {
      Page(page: 1, perPage: $perPage) {
        media(sort: TRENDING_DESC, type: ANIME, isAdult: false) {
          ${MEDIA_FIELDS_BRIEF}
        }
      }
    }
  `;
  const data = await anilistQuery(query, { perPage });
  return data.Page.media;
}

// NEW: Current season picks
async function fetchSeasonalAnime(season, year, perPage = 16) {
  const query = `
    query ($season: MediaSeason, $year: Int, $perPage: Int) {
      Page(page: 1, perPage: $perPage) {
        media(season: $season, seasonYear: $year, sort: SCORE_DESC, type: ANIME, isAdult: false) {
          ${MEDIA_FIELDS_BRIEF}
        }
      }
    }
  `;
  const data = await anilistQuery(query, { season, year, perPage });
  return data.Page.media;
}

// NEW: Full media detail with characters, staff, and relations
async function fetchMediaDetail(id) {
  const query = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
        ${MEDIA_FIELDS}
        characters(sort: ROLE, perPage: 8) {
          edges {
            role
            node {
              id name { full }
              image { medium }
            }
            voiceActors(language: JAPANESE) {
              id name { full }
              image { medium }
              languageV2
            }
          }
        }
        staff(perPage: 6) {
          edges {
            role
            node { id name { full } image { medium } }
          }
        }
        relations {
          edges {
            relationType
            node {
              id type
              title { romaji english }
              coverImage { medium }
              format status
            }
          }
        }
        streamingEpisodes(page: 1, perPage: 3) {
          title thumbnail site url
        }
      }
    }
  `;
  const data = await anilistQuery(query, { id });
  return data.Media;
}

async function fetchRecommendations(mediaId) {
  const query = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
        recommendations(perPage: 10, sort: RATING_DESC) {
          nodes {
            mediaRecommendation {
              ${MEDIA_FIELDS_BRIEF}
            }
          }
        }
      }
    }
  `;
  const data = await anilistQuery(query, { id: mediaId });
  return (data.Media?.recommendations?.nodes || [])
    .map(n => n.mediaRecommendation)
    .filter(Boolean);
}

// NEW: Fetch multiple media by IDs (for watchlist enrichment)
async function fetchMediaByIds(ids) {
  if (!ids.length) return [];
  const query = `
    query ($ids: [Int]) {
      Page(page: 1, perPage: 50) {
        media(id_in: $ids, type: ANIME, isAdult: false) {
          ${MEDIA_FIELDS_BRIEF}
        }
      }
    }
  `;
  const data = await anilistQuery(query, { ids });
  return data.Page.media;
}

// ─────────────────────────────────────────────────────────────────────────────
// AniList OAuth + Authenticated User Queries
// ─────────────────────────────────────────────────────────────────────────────
const ANILIST_CLIENT_ID = "43247"; // Your registered AniList client
// IMPORTANT: This must exactly match the redirect URI registered in your AniList OAuth app
const ANILIST_REDIRECT  = "http://localhost:5173/";
const ANILIST_AUTH_URL  = `https://anilist.co/api/v2/oauth/authorize?client_id=${ANILIST_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(ANILIST_REDIRECT)}`;
const ANILIST_TOKEN_URL = `https://anilist.co/api/v2/oauth/token`;

// Exchange authorization code for access token
async function exchangeCodeForToken(code) {
  console.log("exchangeCodeForToken: exchanging code", code);
  const res = await fetch(ANILIST_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: ANILIST_CLIENT_ID,
      code,
      redirect_uri: ANILIST_REDIRECT,
    }),
  });
  const json = await res.json();
  console.log("exchangeCodeForToken: response", json);
  if (json.error) throw new Error(json.error_description || json.error);
  return json.access_token;
}

function anilistLogin() {
  // Full-page redirect to AniList OAuth
  sessionStorage.setItem("al_login_pending", "1");
  window.location.href = ANILIST_AUTH_URL;
}

async function parseAnilistToken() {
  // Check query string for authorization code (OAuth flow returns ?code=xxx)
  const queryParams = new URLSearchParams(window.location.search);
  const code = queryParams.get("code");
  console.log("parseAnilistToken: URL", window.location.href);
  console.log("parseAnilistToken: code found?", !!code);
  if (code) {
    try {
      const token = await exchangeCodeForToken(code);
      // Clean URL so code doesn't persist in address bar
      window.history.replaceState(null, "", window.location.pathname);
      return token;
    } catch (err) {
      console.error("Token exchange failed:", err);
      return null;
    }
  }

  // Fallback: check hash for access_token (legacy implicit flow)
  const hash = window.location.hash;
  if (hash) {
    const hashParams = new URLSearchParams(hash.replace(/^#/, ""));
    const token = hashParams.get("access_token");
    if (token) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      return token;
    }
  }
  return null;
}

async function anilistAuthQuery(query, variables = {}, token) {
  console.log("anilistAuthQuery: token", token ? "present" : "MISSING");
  const res = await fetch(ANILIST_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  console.log("anilistAuthQuery: response", json);
  if (json.errors) throw new Error(json.errors[0].message);
  return json.data;
}

// Fetch viewer identity
async function fetchViewer(token) {
  const query = `{ Viewer { id name avatar { large } } }`;
  const data = await anilistAuthQuery(query, {}, token);
  return data.Viewer;
}

// Fetch user's completed anime list (watched)
async function fetchUserCompleted(userId, token, page = 1) {
  const query = `
    query ($userId: Int, $page: Int) {
      Page(page: $page, perPage: 50) {
        mediaList(userId: $userId, type: ANIME, status: COMPLETED) {
          mediaId score(format: POINT_10)
          media { ${MEDIA_FIELDS_BRIEF} }
        }
      }
    }
  `;
  const data = await anilistAuthQuery(query, { userId, page }, token);
  return data.Page.mediaList;
}

// Fetch user's favourited anime
async function fetchUserFavourites(userId, token) {
  const query = `
    query ($userId: Int) {
      User(id: $userId) {
        favourites {
          anime(perPage: 50) {
            nodes { ${MEDIA_FIELDS_BRIEF} }
          }
        }
      }
    }
  `;
  const data = await anilistAuthQuery(query, { userId }, token);
  return data.User?.favourites?.anime?.nodes || [];
}

// Fetch user's in-progress / planning list too (to exclude from recommendations)
async function fetchUserPlanning(userId, token) {
  const query = `
    query ($userId: Int) {
      Page(page: 1, perPage: 50) {
        mediaList(userId: $userId, type: ANIME, status_in: [PLANNING, CURRENT]) {
          mediaId
        }
      }
    }
  `;
  const data = await anilistAuthQuery(query, { userId }, token);
  return data.Page.mediaList.map(e => e.mediaId);
}

// Analyze user's completed list to build a genre taste profile
function buildGenreTasteProfile(completedList) {
  // completedList: array of { media, userScore }
  const genreScores = {};
  const genreCounts = {};
  completedList.forEach(entry => {
    const genres = entry.media?.genres || [];
    const score = entry.score || 6; // default 6/10 if unrated
    genres.forEach(g => {
      genreScores[g] = (genreScores[g] || 0) + score;
      genreCounts[g] = (genreCounts[g] || 0) + 1;
    });
  });
  // Weighted average score per genre, min 3 watches
  const profile = Object.entries(genreScores)
    .map(([genre, total]) => ({
      genre,
      avgScore: total / genreCounts[genre],
      count: genreCounts[genre],
    }))
    .filter(g => g.count >= 2)
    .sort((a, b) => (b.avgScore * Math.log(b.count + 1)) - (a.avgScore * Math.log(a.count + 1)));
  return profile; // sorted by weighted enjoyment
}

// Fetch personalised "For You" recommendations based on genre taste profile
async function fetchForYouRecs(tasteProfile, watchedIds, perGenre = 20) {
  const topGenres = tasteProfile.slice(0, 4).map(g => g.genre);
  if (!topGenres.length) return [];
  const query = `
    query ($genres: [String], $perPage: Int) {
      Page(page: 1, perPage: $perPage) {
        media(genre_in: $genres, sort: SCORE_DESC, type: ANIME, isAdult: false) {
          ${MEDIA_FIELDS_BRIEF}
        }
      }
    }
  `;
  const data = await anilistQuery(query, { genres: topGenres, perPage: perGenre });
  return (data.Page.media || [])
    .map(normalise)
    .filter(a => a && !watchedIds.has(a.id));
}

// Normalise AniList media → internal format
function normalise(m) {
  if (!m) return null;
  return {
    id: m.id,
    title: m.title?.english || m.title?.romaji || "Unknown",
    titleJp: m.title?.romaji,
    titleNative: m.title?.native,
    year: m.startDate?.year || "—",
    score: m.averageScore ? (m.averageScore / 10).toFixed(1) : "—",
    scoreRaw: m.averageScore || 0,
    genres: m.genres || [],
    tags: m.tags || [],
    image: m.coverImage?.extraLarge || m.coverImage?.large || "",
    coverColor: m.coverImage?.color || "#1C1C28",
    banner: m.bannerImage || m.coverImage?.extraLarge || m.coverImage?.large || "",
    synopsis: m.description
      ? m.description.replace(/<[^>]+>/g, "").replace(/\n{3,}/g, "\n\n").trim()
      : "No synopsis available.",
    episodes: m.episodes,
    duration: m.duration,
    status: m.status,
    format: m.format,
    source: m.source,
    season: m.season,
    seasonYear: m.seasonYear,
    studios: m.studios?.nodes || [],
    popularity: m.popularity || 0,
    favourites: m.favourites || 0,
    externalLinks: m.externalLinks || [],
    trailer: m.trailer || null,
    nextEpisode: m.nextAiringEpisode || null,
  };
}

// Get current anime season
function getCurrentSeason() {
  const month = new Date().getMonth() + 1;
  const year = new Date().getFullYear();
  if (month >= 1 && month <= 3) return { season: "WINTER", year };
  if (month >= 4 && month <= 6) return { season: "SPRING", year };
  if (month >= 7 && month <= 9) return { season: "SUMMER", year };
  return { season: "FALL", year };
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=DM+Sans:wght@300;400;500&family=Noto+Serif+JP:wght@300&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --void:       #0A0A0F;
  --obsidian:   #111118;
  --slate:      #1C1C28;
  --mist:       #2A2A3E;
  --silver:     #8888A8;
  --pearl:      #C8C8DC;
  --white:      #F0F0F8;
  --ember:      #E8603C;
  --ember-soft: rgba(232,96,60,0.13);
  --gold:       #C9A84C;
  --sakura:     #C47FA0;
  --aoi:        #4A8FA8;
  --jade:       #3DA882;
  --ease-cinema: cubic-bezier(0.16,1,0.3,1);
  --ease-reveal: cubic-bezier(0.0,0.0,0.2,1);
}

html { font-size: 16px; }
body { background: var(--void); color: var(--pearl); font-family: 'DM Sans', sans-serif; overflow-x: hidden; }
button { cursor: pointer; border: none; background: none; font-family: inherit; }
input { font-family: inherit; }
img { display: block; }

/* Particles */
.particles { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.particle {
  position: absolute; width: 2px; height: 2px;
  background: var(--pearl); border-radius: 50%; opacity: 0;
  animation: drift linear infinite;
}
@keyframes drift {
  0%   { opacity: 0; transform: translateY(100vh) translateX(0); }
  10%  { opacity: 0.35; }
  90%  { opacity: 0.12; }
  100% { opacity: 0; transform: translateY(-10vh) translateX(var(--dx,20px)); }
}

/* Transitions */
.screen { min-height: 100vh; position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.fade-in  { animation: fadeIn 0.65s var(--ease-cinema) both; }
@keyframes fadeIn { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:none; } }

.stagger > * { opacity:0; animation: fadeIn 0.65s var(--ease-cinema) both; }
.stagger > *:nth-child(1) { animation-delay:80ms; }
.stagger > *:nth-child(2) { animation-delay:200ms; }
.stagger > *:nth-child(3) { animation-delay:320ms; }
.stagger > *:nth-child(4) { animation-delay:440ms; }
.stagger > *:nth-child(5) { animation-delay:560ms; }
.stagger > *:nth-child(6) { animation-delay:680ms; }
.stagger > *:nth-child(7) { animation-delay:800ms; }

/* Screen 1: Arrival */
.arrival-bg { position:absolute; inset:0; background:radial-gradient(ellipse 80% 60% at 50% 40%, #1a1028 0%, var(--void) 70%); }
.arrival-content { position:relative; z-index:2; text-align:center; display:flex; flex-direction:column; align-items:center; }
.logo-mark { font-family:'Cormorant Garamond',serif; font-size:5rem; font-weight:300; letter-spacing:-0.04em; color:var(--white); line-height:1; }
.logo-jp   { font-family:'Noto Serif JP',serif; font-weight:300; font-size:1rem; letter-spacing:0.3em; color:var(--silver); margin-top:4px; }
.logo-rule { width:60px; height:1px; background:linear-gradient(90deg,transparent,var(--mist),transparent); margin:24px auto; }
.tagline   { font-family:'Cormorant Garamond',serif; font-style:italic; font-size:1.4rem; color:var(--pearl); max-width:340px; line-height:1.4; }
.begin-btn {
  margin-top:48px; padding:14px 48px; background:transparent;
  border:1px solid rgba(240,240,248,0.35); border-radius:2px;
  color:var(--pearl) !important; font-size:0.75rem; letter-spacing:0.18em; text-transform:uppercase;
  opacity:1 !important; transition:border-color 0.3s, background 0.3s, box-shadow 0.3s;
}
.begin-btn:hover { border-color:var(--ember); background:var(--ember-soft); box-shadow:0 0 20px rgba(232,96,60,0.2); }

/* Screen 2: Invitation */
.screen-content { max-width:560px; width:100%; padding:0 24px; text-align:center; }
.screen-title { font-family:'Cormorant Garamond',serif; font-size:2.75rem; color:var(--white); letter-spacing:-0.02em; line-height:1.15; margin-bottom:48px; }
.screen-subtitle { font-size:0.875rem; color:var(--silver); margin-bottom:40px; letter-spacing:0.01em; }
.choice-card {
  width:100%; padding:22px 28px; background:var(--obsidian); border:1px solid var(--mist);
  border-radius:4px; color:var(--pearl); font-size:1rem; text-align:left;
  margin-bottom:12px; transition:all 0.22s var(--ease-cinema);
  display:flex; align-items:center; gap:14px;
}
.choice-card:hover  { border-color:var(--ember); background:var(--slate); color:var(--white); }
.choice-card.selected { border-color:var(--ember); background:var(--ember-soft); color:var(--white); }
.choice-dot  { width:6px; height:6px; border-radius:50%; background:var(--ember); opacity:0; transition:opacity 0.2s; flex-shrink:0; }
.choice-card.selected .choice-dot { opacity:1; }
.choice-label { font-size:0.7rem; letter-spacing:0.15em; text-transform:uppercase; color:var(--ember); display:block; margin-bottom:2px; }

/* Screen 3: Mood */
.mood-grid { display:flex; flex-wrap:wrap; gap:12px; justify-content:center; max-width:640px; padding:0 24px; }
.mood-card {
  padding:18px 24px; border-radius:4px; cursor:pointer;
  border:1px solid transparent; transition:all 0.22s var(--ease-cinema);
  min-width:140px; text-align:center;
}
.mood-card:hover  { transform:scale(1.03); }
.mood-card.selected { border-color:rgba(255,255,255,0.3); transform:scale(1.03); }
.mood-jp  { font-family:'Noto Serif JP',serif; font-weight:300; font-size:1.1rem; display:block; opacity:0.7; margin-bottom:4px; }
.mood-en  { font-size:0.7rem; letter-spacing:0.15em; text-transform:uppercase; display:block; font-weight:500; }
.mood-sub { font-size:0.7rem; opacity:0.55; display:block; margin-top:2px; }
.mood-check { font-size:0.75rem; margin-top:8px; opacity:0; transition:opacity 0.2s; }
.mood-card.selected .mood-check { opacity:1; }

.continue-btn {
  display:block; margin:40px auto 0;
  padding:16px 56px; background:var(--ember); color:var(--white) !important;
  font-size:0.8rem; letter-spacing:0.15em; text-transform:uppercase;
  border-radius:2px; transition:all 0.22s var(--ease-cinema);
  opacity:0; pointer-events:none; white-space:nowrap;
  box-shadow:0 8px 32px rgba(232,96,60,0.28);
}
.continue-btn.visible { opacity:1; pointer-events:all; animation:fadeIn 0.4s var(--ease-cinema) both; }
.continue-btn:hover { background:#f07050; transform:translateY(-2px); box-shadow:0 12px 40px rgba(232,96,60,0.4); }

/* Screen 4: Selection */
.selection-screen { max-width:1100px; margin:0 auto; width:100%; padding:40px 24px 160px; }
.selection-header { text-align:center; margin-bottom:32px; }
.search-wrap { position:relative; max-width:540px; margin:0 auto 32px; }
.search-input {
  width:100%; padding:16px 24px; background:var(--slate);
  border:1px solid var(--mist); border-radius:4px; color:var(--white);
  font-size:1rem; outline:none; transition:border-color 0.2s;
}
.search-input::placeholder { color:var(--silver); }
.search-input:focus { border-color:var(--ember); }

.anime-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(160px,1fr)); gap:16px; }
.anime-card-wrap { animation:fadeIn 0.5s var(--ease-cinema) both; }
.anime-card {
  position:relative; border-radius:4px; overflow:hidden;
  aspect-ratio:2/3; cursor:pointer; border:2px solid transparent;
  transition:transform 0.22s var(--ease-cinema), box-shadow 0.22s;
}
.anime-card:hover  { transform:scale(1.04); box-shadow:0 16px 48px rgba(0,0,0,0.7); }
.anime-card.selected { border-color:var(--ember); }
.anime-card-overlay {
  position:absolute; bottom:0; left:0; right:0;
  background:linear-gradient(transparent,rgba(10,10,15,0.95));
  padding:32px 12px 12px;
}
.anime-card-title { font-size:0.78rem; color:var(--white); line-height:1.3; }
.anime-card-meta  { font-size:0.68rem; color:var(--silver); margin-top:2px; }
.anime-card-check {
  position:absolute; top:8px; right:8px; width:24px; height:24px;
  background:var(--ember); border-radius:50%; display:flex; align-items:center;
  justify-content:center; font-size:0.7rem; color:white; opacity:0; transition:opacity 0.2s;
}
.anime-card.selected .anime-card-check { opacity:1; }

/* Loading state */
.loading-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(160px,1fr)); gap:16px; }
.loading-card { aspect-ratio:2/3; border-radius:4px; background:linear-gradient(90deg,var(--obsidian) 25%,var(--slate) 50%,var(--obsidian) 75%); background-size:200% 100%; animation:shimmer 1.5s infinite; }
@keyframes shimmer { 0% { background-position:200% 0; } 100% { background-position:-200% 0; } }
.spinner { width:32px; height:32px; border:2px solid var(--mist); border-top-color:var(--ember); border-radius:50%; animation:spin 0.7s linear infinite; margin:40px auto; }
@keyframes spin { to { transform:rotate(360deg); } }

/* Tray */
.tray {
  position:fixed; bottom:0; left:0; right:0; z-index:50;
  background:linear-gradient(transparent,var(--obsidian) 30%);
  padding:40px 24px 24px;
}
.tray-inner { max-width:700px; margin:0 auto; background:var(--slate); border:1px solid var(--mist); border-radius:6px; padding:16px 20px; display:flex; align-items:center; gap:16px; }
.tray-thumbs { display:flex; gap:8px; flex:1; overflow:hidden; }
.tray-thumb  { width:36px; height:48px; border-radius:2px; object-fit:cover; border:1px solid var(--mist); flex-shrink:0; }
.tray-msg    { font-size:0.75rem; color:var(--silver); flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.reveal-btn  {
  padding:12px 28px; background:var(--ember); color:var(--white);
  font-size:0.75rem; letter-spacing:0.12em; text-transform:uppercase;
  border-radius:3px; transition:all 0.2s; white-space:nowrap; flex-shrink:0;
  box-shadow:0 4px 20px rgba(232,96,60,0.35);
}
.reveal-btn:hover    { background:#f07050; transform:translateY(-1px); }
.reveal-btn:disabled { opacity:0.4; pointer-events:none; }

/* Taste Reveal */
.trait-list  { list-style:none; max-width:380px; margin:24px auto; text-align:left; }
.trait-item  { display:flex; align-items:center; gap:10px; padding:10px 0; border-bottom:1px solid var(--mist); font-size:0.875rem; color:var(--pearl); }
.trait-dot   { width:6px; height:6px; border-radius:50%; background:var(--ember); flex-shrink:0; }
.profile-pill { display:inline-flex; padding:6px 16px; border:1px solid var(--mist); border-radius:20px; font-size:0.75rem; color:var(--pearl); margin:4px; }
.strength-bar { height:4px; border-radius:2px; background:linear-gradient(90deg,var(--ember),var(--gold)); margin-top:8px; transition:width 0.8s var(--ease-cinema); }

/* Nav */
.nav {
  position:fixed; top:0; left:0; right:0; z-index:100;
  padding:0 32px; height:60px; display:flex; align-items:center;
  background:linear-gradient(var(--void),transparent);
  backdrop-filter:blur(12px); border-bottom:1px solid rgba(42,42,62,0.5);
}
.nav-logo  { font-family:'Cormorant Garamond',serif; font-size:1.5rem; letter-spacing:-0.02em; color:var(--white); }
.nav-logo span { font-family:'Noto Serif JP',serif; font-weight:300; font-size:0.75rem; color:var(--silver); margin-left:8px; vertical-align:middle; }
.nav-links { display:flex; gap:28px; margin-left:auto; }
.nav-link  { font-size:0.78rem; letter-spacing:0.1em; text-transform:uppercase; color:var(--silver); transition:color 0.2s; cursor:pointer; }
.nav-link:hover, .nav-link.active { color:var(--white); }
.nav-watchlist-badge {
  display:inline-flex; align-items:center; justify-content:center;
  min-width:18px; height:18px; border-radius:9px; background:var(--ember);
  font-size:0.6rem; color:white; margin-left:5px; padding:0 5px; font-weight:500;
}
.nav-reset { padding:8px 18px; border:1px solid var(--mist); border-radius:2px; font-size:0.7rem; letter-spacing:0.1em; text-transform:uppercase; color:var(--silver); transition:all 0.2s; margin-left:24px; }
.nav-reset:hover { border-color:var(--ember); color:var(--ember); }

/* Hero */
.hero { position:relative; height:75vh; overflow:hidden; }
.hero-bg  { position:absolute; inset:0; }
.hero-bg img { width:100%; height:100%; object-fit:cover; filter:brightness(0.45) saturate(0.9); }
.hero-overlay { position:absolute; inset:0; background:linear-gradient(90deg,rgba(10,10,15,0.95) 0%,rgba(10,10,15,0.5) 55%,transparent 100%); }
.hero-content { position:absolute; bottom:80px; left:80px; max-width:520px; }
.hero-badge { display:inline-flex; align-items:center; gap:6px; padding:5px 12px; background:var(--ember-soft); border:1px solid var(--ember); border-radius:2px; font-size:0.65rem; letter-spacing:0.15em; text-transform:uppercase; color:var(--ember); margin-bottom:18px; }
.hero-badge-dot { width:5px; height:5px; border-radius:50%; background:var(--ember); }
.hero-title { font-family:'Cormorant Garamond',serif; font-size:3.2rem; color:var(--white); line-height:1.1; letter-spacing:-0.03em; margin-bottom:10px; }
.hero-title-jp { font-family:'Noto Serif JP',serif; font-weight:300; font-size:0.875rem; color:var(--silver); letter-spacing:0.1em; margin-bottom:14px; }
.hero-meta { display:flex; gap:20px; margin-bottom:14px; }
.hero-meta-item { font-size:0.75rem; color:var(--silver); }
.hero-meta-item strong { color:var(--gold); font-weight:400; }
.hero-synopsis { font-size:0.9rem; color:var(--pearl); line-height:1.7; opacity:0.85; margin-bottom:26px; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; }
.hero-cta { display:flex; gap:12px; }
.btn-primary { padding:13px 32px; background:var(--ember); color:var(--white); font-size:0.78rem; letter-spacing:0.12em; text-transform:uppercase; border-radius:2px; transition:all 0.2s; box-shadow:0 4px 20px rgba(232,96,60,0.3); }
.btn-primary:hover { background:#f07050; transform:translateY(-1px); }
.btn-ghost  { padding:13px 32px; border:1px solid rgba(240,240,248,0.2); color:var(--pearl); font-size:0.78rem; letter-spacing:0.12em; text-transform:uppercase; border-radius:2px; transition:all 0.2s; }
.btn-ghost:hover  { border-color:var(--pearl); color:var(--white); }
.btn-watchlist { padding:13px 32px; border:1px solid var(--jade); color:var(--jade); font-size:0.78rem; letter-spacing:0.12em; text-transform:uppercase; border-radius:2px; transition:all 0.2s; }
.btn-watchlist:hover  { background:rgba(61,168,130,0.1); color:var(--white); border-color:var(--white); }
.btn-watchlist.saved  { background:rgba(61,168,130,0.15); }
.hero-scroll { position:absolute; bottom:24px; right:40px; display:flex; flex-direction:column; align-items:center; gap:8px; }
.hero-scroll-line { width:1px; height:48px; background:linear-gradient(var(--pearl),transparent); animation:scrollPulse 2s ease-in-out infinite; }
@keyframes scrollPulse { 0%,100% { opacity:0.3; } 50% { opacity:0.8; } }

/* Sections */
.section { padding:52px 80px; }
.section-header { display:flex; align-items:baseline; gap:16px; margin-bottom:24px; }
.section-title  { font-family:'Cormorant Garamond',serif; font-size:1.5rem; color:var(--white); letter-spacing:-0.01em; }
.section-meta   { font-size:0.72rem; color:var(--silver); letter-spacing:0.05em; }
.section-badge  { font-size:0.62rem; letter-spacing:0.1em; text-transform:uppercase; padding:3px 8px; border-radius:2px; }
.section-badge.live { background:rgba(232,96,60,0.15); color:var(--ember); border:1px solid rgba(232,96,60,0.3); }
.section-badge.season { background:rgba(74,143,168,0.15); color:var(--aoi); border:1px solid rgba(74,143,168,0.3); }
.section-rule   { flex:1; height:1px; background:var(--mist); }
.scroll-row { display:flex; gap:16px; overflow-x:auto; padding-bottom:8px; scrollbar-width:none; }
.scroll-row::-webkit-scrollbar { display:none; }

/* Reco Card */
.reco-card {
  flex-shrink:0; width:170px; border-radius:4px; overflow:hidden; cursor:pointer;
  transition:transform 0.22s var(--ease-cinema), box-shadow 0.22s; position:relative;
  border:1px solid var(--mist);
}
.reco-card:hover { transform:scale(1.05) translateY(-4px); box-shadow:0 20px 60px rgba(0,0,0,0.7); border-color:rgba(232,96,60,0.3); }
.reco-card-img  { width:100%; aspect-ratio:2/3; object-fit:cover; filter:saturate(0.9); transition:filter 0.22s; }
.reco-card:hover .reco-card-img { filter:saturate(1.1); }
.reco-card-body { padding:10px 12px; background:var(--obsidian); }
.reco-card-title { font-size:0.78rem; color:var(--white); line-height:1.3; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.reco-card-meta  { font-size:0.68rem; color:var(--silver); margin-top:3px; }
.reco-score { color:var(--gold); }
.match-pct  { position:absolute; top:8px; right:8px; padding:3px 7px; background:rgba(10,10,15,0.88); border:1px solid var(--ember); border-radius:2px; font-size:0.62rem; color:var(--ember); letter-spacing:0.05em; }
.trending-rank { position:absolute; top:8px; left:8px; padding:3px 7px; background:rgba(10,10,15,0.88); border:1px solid var(--aoi); border-radius:2px; font-size:0.62rem; color:var(--aoi); letter-spacing:0.05em; }
.watchlist-badge { position:absolute; top:8px; left:8px; padding:3px 7px; background:rgba(10,10,15,0.88); border:1px solid var(--jade); border-radius:2px; font-size:0.62rem; color:var(--jade); }
.airing-badge { position:absolute; bottom:52px; left:0; right:0; padding:3px 8px; background:rgba(10,10,15,0.9); border-top:1px solid var(--mist); font-size:0.6rem; color:var(--aoi); text-align:center; }

/* Error/empty */
.empty-state { text-align:center; padding:60px 24px; color:var(--silver); }
.empty-state p { font-size:0.9rem; margin-top:8px; }

/* Detail overlay */
.detail-overlay { position:fixed; inset:0; z-index:200; background:rgba(10,10,15,0.97); overflow-y:auto; animation:fadeIn 0.3s var(--ease-cinema); }
.detail-close {
  position:fixed; top:20px; right:24px; width:40px; height:40px;
  border:1px solid var(--mist); border-radius:50%; display:flex; align-items:center;
  justify-content:center; color:var(--pearl); font-size:1.1rem; transition:all 0.2s; z-index:201; background:var(--obsidian);
}
.detail-close:hover { border-color:var(--ember); color:var(--ember); transform:rotate(90deg); }
.detail-banner { height:360px; position:relative; overflow:hidden; }
.detail-banner-overlay { position:absolute; inset:0; background:linear-gradient(transparent 40%,var(--void) 100%); }
.detail-body  { max-width:900px; margin:0 auto; padding:0 40px 80px; }
.detail-main  { display:grid; grid-template-columns:200px 1fr; gap:40px; margin-top:-80px; position:relative; z-index:2; }
.detail-poster { width:200px; aspect-ratio:2/3; object-fit:cover; border-radius:4px; box-shadow:0 20px 60px rgba(0,0,0,0.7); border:1px solid var(--mist); }
.detail-info  { padding-top:40px; }
.detail-title { font-family:'Cormorant Garamond',serif; font-size:2.4rem; color:var(--white); letter-spacing:-0.02em; line-height:1.1; }
.detail-title-jp { font-family:'Noto Serif JP',serif; font-weight:300; font-size:0.875rem; color:var(--silver); margin-top:6px; margin-bottom:16px; }
.detail-tags  { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:16px; }
.genre-pill   { padding:4px 12px; border:1px solid var(--mist); border-radius:2px; font-size:0.7rem; letter-spacing:0.1em; text-transform:uppercase; color:var(--silver); }
.detail-stats { display:flex; gap:24px; margin-bottom:20px; flex-wrap:wrap; }
.stat-item    { text-align:center; }
.stat-val     { font-family:'Cormorant Garamond',serif; font-size:1.8rem; color:var(--white); }
.stat-lbl     { font-size:0.65rem; letter-spacing:0.12em; text-transform:uppercase; color:var(--silver); }
.detail-synopsis { font-size:0.915rem; line-height:1.8; color:var(--pearl); }
.detail-actions  { display:flex; gap:12px; margin-top:24px; flex-wrap:wrap; }

/* NEW: Character/Staff section */
.char-grid { display:flex; gap:12px; overflow-x:auto; padding-bottom:8px; scrollbar-width:none; margin-top:16px; }
.char-grid::-webkit-scrollbar { display:none; }
.char-card { flex-shrink:0; width:88px; text-align:center; cursor:default; }
.char-card-img { width:88px; height:88px; border-radius:4px; object-fit:cover; border:1px solid var(--mist); }
.char-card-name { font-size:0.65rem; color:var(--pearl); margin-top:5px; line-height:1.2; }
.char-card-role { font-size:0.58rem; color:var(--silver); text-transform:uppercase; letter-spacing:0.08em; }
.va-name { font-size:0.6rem; color:var(--aoi); margin-top:2px; }

/* NEW: Relations row */
.relation-card { flex-shrink:0; width:130px; border-radius:4px; overflow:hidden; border:1px solid var(--mist); cursor:pointer; transition:all 0.2s; }
.relation-card:hover { border-color:rgba(232,96,60,0.3); transform:translateY(-2px); }
.relation-card-img { width:100%; aspect-ratio:2/3; object-fit:cover; }
.relation-card-body { padding:8px 10px; background:var(--obsidian); }
.relation-type { font-size:0.58rem; letter-spacing:0.1em; text-transform:uppercase; color:var(--ember); margin-bottom:2px; }
.relation-title { font-size:0.7rem; color:var(--white); line-height:1.2; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }

/* NEW: Streaming links */
.streaming-links { display:flex; gap:10px; flex-wrap:wrap; margin-top:12px; }
.stream-link {
  display:inline-flex; align-items:center; gap:6px; padding:7px 14px;
  border:1px solid var(--mist); border-radius:2px; font-size:0.72rem;
  color:var(--pearl); text-decoration:none; transition:all 0.2s;
}
.stream-link:hover { border-color:var(--ember); color:var(--white); }

/* NEW: Tags section */
.tag-pill { display:inline-flex; padding:3px 10px; background:var(--slate); border-radius:2px; font-size:0.68rem; color:var(--silver); margin:3px; }

/* Section badges */
.section-badge { font-size:0.65rem; letter-spacing:0.1em; padding:3px 10px; border-radius:2px; text-transform:uppercase; }
.section-badge.live   { background:rgba(61,168,130,0.15); color:var(--jade); border:1px solid rgba(61,168,130,0.3); }
.section-badge.season { background:rgba(196,127,160,0.12); color:var(--sakura); border:1px solid rgba(196,127,160,0.3); }
.section-badge.al     { background:rgba(74,143,168,0.15); color:var(--aoi); border:1px solid rgba(74,143,168,0.3); }
.section-badge.foryou { background:linear-gradient(135deg,rgba(232,96,60,0.15),rgba(201,168,76,0.12)); color:var(--gold); border:1px solid rgba(201,168,76,0.3); }

/* NEW: Studio info */
.studio-link { font-size:0.78rem; color:var(--aoi); text-decoration:none; border-bottom:1px solid rgba(74,143,168,0.3); transition:border-color 0.2s; }
.studio-link:hover { border-color:var(--aoi); }

/* Watchlist screen */
.watchlist-screen { max-width:1100px; margin:0 auto; width:100%; padding:90px 24px 60px; }
.watchlist-header { margin-bottom:40px; }
.watchlist-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:20px; }
.watchlist-item {
  background:var(--obsidian); border:1px solid var(--mist); border-radius:4px;
  overflow:hidden; display:flex; gap:0; transition:border-color 0.2s; cursor:pointer;
}
.watchlist-item:hover { border-color:rgba(232,96,60,0.35); }
.watchlist-item-img { width:70px; flex-shrink:0; aspect-ratio:2/3; object-fit:cover; }
.watchlist-item-body { padding:12px 14px; flex:1; min-width:0; }
.watchlist-item-title { font-size:0.82rem; color:var(--white); line-height:1.3; margin-bottom:4px; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
.watchlist-item-meta { font-size:0.7rem; color:var(--silver); }
.watchlist-item-remove { padding:4px 8px; border:1px solid var(--mist); border-radius:2px; font-size:0.65rem; color:var(--silver); transition:all 0.2s; margin-top:8px; display:block; width:fit-content; }
.watchlist-item-remove:hover { border-color:#e84545; color:#e84545; }

/* Detail section headers */
.section-sub { font-family:'Cormorant Garamond',serif; font-size:1.2rem; color:var(--white); margin-bottom:12px; padding-bottom:8px; border-bottom:1px solid var(--mist); }

/* ── AniList Login Banner ── */
.al-banner {
  background: linear-gradient(135deg, #1a1230, #0e1a2a);
  border: 1px solid rgba(74,143,168,0.3); border-radius:6px;
  padding:20px 24px; display:flex; align-items:center; gap:16px;
  margin-bottom:32px; flex-wrap:wrap;
}
.al-avatar { width:44px; height:44px; border-radius:50%; object-fit:cover; border:2px solid var(--aoi); }
.al-name { font-size:0.875rem; color:var(--white); font-weight:500; }
.al-sub  { font-size:0.75rem; color:var(--silver); margin-top:2px; }
.al-login-btn {
  padding:10px 22px; background:transparent;
  border:1px solid var(--aoi); border-radius:3px;
  color:var(--aoi); font-size:0.75rem; letter-spacing:0.12em;
  text-transform:uppercase; transition:all 0.22s; flex-shrink:0;
}
.al-login-btn:hover { background:rgba(74,143,168,0.12); color:var(--white); border-color:var(--pearl); }
.al-login-btn.loading { opacity:0.5; pointer-events:none; }
.al-logout-btn {
  padding:7px 16px; background:transparent;
  border:1px solid var(--mist); border-radius:3px;
  color:var(--silver); font-size:0.7rem; letter-spacing:0.1em;
  text-transform:uppercase; transition:all 0.2s; margin-left:auto;
}
.al-logout-btn:hover { border-color:#e84545; color:#e84545; }
.al-stats { display:flex; gap:20px; margin-left:auto; }
.al-stat  { text-align:center; }
.al-stat-val { font-family:'Cormorant Garamond',serif; font-size:1.4rem; color:var(--white); }
.al-stat-lbl { font-size:0.62rem; letter-spacing:0.1em; text-transform:uppercase; color:var(--silver); }

/* ── Trailer ── */
.trailer-wrap {
  margin-top:28px; border-radius:6px; overflow:hidden;
  border:1px solid var(--mist); background:var(--obsidian);
  aspect-ratio:16/9; position:relative;
}
.trailer-wrap iframe { width:100%; height:100%; border:none; display:block; }
.trailer-thumb {
  width:100%; height:100%; object-fit:cover;
  position:absolute; inset:0; cursor:pointer;
  transition:filter 0.2s;
}
.trailer-thumb:hover { filter:brightness(1.1); }
.trailer-play {
  position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
  width:64px; height:64px; background:rgba(232,96,60,0.9); border-radius:50%;
  display:flex; align-items:center; justify-content:center;
  font-size:1.4rem; color:white; pointer-events:none;
  box-shadow:0 4px 24px rgba(232,96,60,0.5);
}
.trailer-label {
  position:absolute; bottom:12px; left:12px;
  font-size:0.65rem; letter-spacing:0.12em; text-transform:uppercase;
  color:rgba(240,240,248,0.7); background:rgba(10,10,15,0.7);
  padding:4px 10px; border-radius:2px;
}

/* ── Scroll Row with buttons ── */
.scroll-row-wrap { position:relative; }
.scroll-btn {
  position:absolute; top:50%; transform:translateY(-50%);
  width:38px; height:56px; z-index:10;
  background:linear-gradient(var(--obsidian),var(--obsidian)) padding-box,
             linear-gradient(var(--mist),var(--mist)) border-box;
  border:1px solid var(--mist); border-radius:3px;
  color:var(--pearl); font-size:1.1rem; display:flex; align-items:center;
  justify-content:center; transition:all 0.2s; opacity:0.85;
  backdrop-filter:blur(4px);
}
.scroll-btn:hover { border-color:var(--ember); color:var(--ember); opacity:1; background:var(--slate); }
.scroll-btn:disabled { opacity:0.2; pointer-events:none; }
.scroll-btn-left  { left:-19px; }
.scroll-btn-right { right:-19px; }

/* ── Synopsis expand ── */
.synopsis-text { font-size:0.915rem; line-height:1.85; color:var(--pearl); white-space:pre-line; }

/* ── Mood genre hint ── */
.mood-genre-hint { font-size:0.62rem; letter-spacing:0.1em; text-transform:uppercase; color:inherit; opacity:0.55; margin-top:4px; display:block; }

@media (max-width:768px) {
  .section { padding:36px 20px; }
  .hero-content { left:20px; right:20px; bottom:56px; }
  .hero-title { font-size:2rem; }
  .detail-main { grid-template-columns:1fr; }
  .detail-poster { width:140px; }
  .nav-links { display:none; }
  .anime-grid { grid-template-columns:repeat(auto-fill, minmax(130px,1fr)); }
  .detail-body { padding:0 20px 60px; }
  .watchlist-grid { grid-template-columns:1fr; }
  .scroll-btn { display:none; }
  .al-banner { flex-direction:column; align-items:flex-start; }
  .al-stats { margin-left:0; }
}
`;

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const MOODS = [
  { jp:"壮大",  en:"EPIC",           sub:"action · spectacle",    bg:"#2a0e0e", color:"#e84545", genre:"Action"       },
  { jp:"日常",  en:"EVERYDAY CALM",  sub:"slice-of-life",          bg:"#0e1a2a", color:"#4A8FA8", genre:"Slice of Life" },
  { jp:"感情",  en:"EMOTIONAL DEPTH",sub:"drama · tears",          bg:"#2a1020", color:"#C47FA0", genre:"Drama"        },
  { jp:"謎",    en:"MYSTERY",        sub:"thriller · suspense",    bg:"#160e2a", color:"#7b5ea7", genre:"Mystery"      },
  { jp:"不思議",en:"WONDER",         sub:"fantasy · magic",        bg:"#1a1500", color:"#C9A84C", genre:"Fantasy"      },
  { jp:"闇",   en:"DARK MATTER",     sub:"psychological",          bg:"#0f0f0f", color:"#888888", genre:"Psychological" },
  { jp:"笑い", en:"COMEDY",          sub:"warmth · laughs",        bg:"#1a1200", color:"#d4a43a", genre:"Comedy"       },
  { jp:"恋愛", en:"ROMANCE",         sub:"heart · longing",        bg:"#2a0e18", color:"#C47FA0", genre:"Romance"      },
];

const ENGAGEMENT_CHOICES = [
  { label:"Casually",     sub:"I watch whatever's good" },
  { label:"Passionately", sub:"I track everything"      },
  { label:"Selectively",  sub:"Quality over quantity"   },
];

const FORMAT_LABELS = {
  TV:"TV Series", TV_SHORT:"TV Short", MOVIE:"Movie", SPECIAL:"Special",
  OVA:"OVA", ONA:"ONA", MUSIC:"Music",
};

const SOURCE_LABELS = {
  MANGA:"Manga", ORIGINAL:"Original", LIGHT_NOVEL:"Light Novel",
  VISUAL_NOVEL:"Visual Novel", VIDEO_GAME:"Video Game", NOVEL:"Novel",
  DOUJINSHI:"Doujinshi", ANIME:"Anime", WEB_MANGA:"Web Manga",
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function computeMatchPct(anime, likedAnime, selectedMoods) {
  if (!likedAnime.length && !selectedMoods.length) return Math.floor(70 + Math.random() * 20);
  let score = 50;
  const likedGenres = likedAnime.flatMap(a => a.genres);
  const overlap = anime.genres.filter(g => likedGenres.includes(g)).length;
  score += overlap * 8;
  const moodGenres = selectedMoods
    .map(m => MOODS.find(mo => mo.en === m)?.genre)
    .filter(Boolean);
  const moodMatch = anime.genres.filter(g => moodGenres.includes(g)).length;
  score += moodMatch * 10;
  if (anime.scoreRaw > 80) score += 5;
  return Math.min(Math.max(score, 55), 99);
}

function getTasteTraits(likedAnime) {
  const counts = {};
  likedAnime.flatMap(a => a.genres).forEach(g => counts[g] = (counts[g]||0)+1);
  const top = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,3).map(e=>e[0]);
  const map = {
    Action:"High-energy storytelling", Drama:"Emotionally resonant narratives",
    Mystery:"Psychological complexity", Fantasy:"Imaginative world-building",
    "Sci-Fi":"Conceptual depth & ideas", Romance:"Character-driven intimacy",
    "Slice of Life":"Quiet, reflective moments", Comedy:"Warm, light-hearted tone",
  };
  const traits = top.map(g => map[g]).filter(Boolean);
  if (traits.length < 2) traits.push("Beautiful visual storytelling","Compelling character arcs");
  return traits.slice(0,4);
}

function formatStatus(s) {
  if (!s) return "—";
  return { FINISHED:"Finished", RELEASING:"Airing", NOT_YET_RELEASED:"Upcoming",
    CANCELLED:"Cancelled", HIATUS:"On Hiatus" }[s] || s;
}

function formatAiringTime(airingAt) {
  const now = Math.floor(Date.now() / 1000);
  const diff = airingAt - now;
  if (diff < 0) return "Recently aired";
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  if (days > 0) return `Ep ${days}d ${hours}h`;
  return `${hours}h`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────
function Particles({ count=40 }) {
  const ps = Array.from({length:count},(_,i)=>({
    id:i, left:Math.random()*100,
    duration:8+Math.random()*16, delay:Math.random()*12,
    dx:(Math.random()-0.5)*60, size:Math.random()>0.7?3:2,
  }));
  return (
    <div className="particles">
      {ps.map(p=>(
        <div key={p.id} className="particle" style={{
          left:`${p.left}%`,bottom:0,width:p.size,height:p.size,
          animationDuration:`${p.duration}s`,animationDelay:`${p.delay}s`,
          "--dx":`${p.dx}px`,
        }}/>
      ))}
    </div>
  );
}

function RadarChart({ likedAnime }) {
  const axes = ["Action","Drama","Mystery","Romance","Fantasy","Sci-Fi"];
  const counts = {};
  likedAnime.flatMap(a=>a.genres).forEach(g=>counts[g]=(counts[g]||0)+1);
  const max = Math.max(1,...Object.values(counts));
  const vals = axes.map(a=>(counts[a]||0)/max);
  const cx=130,cy=130,r=100;
  const web = [0.25,0.5,0.75,1.0].map(f=>
    axes.map((_,i)=>{const a=(i*2*Math.PI/6)-Math.PI/2;return`${cx+r*f*Math.cos(a)},${cy+r*f*Math.sin(a)}`;}).join(" ")
  );
  const pts = axes.map((_,i)=>{const a=(i*2*Math.PI/6)-Math.PI/2;return{x:cx+r*Math.cos(a),y:cy+r*Math.sin(a)};});
  const dpts = vals.map((v,i)=>{const a=(i*2*Math.PI/6)-Math.PI/2,rv=0.15+v*0.85;return{x:cx+r*rv*Math.cos(a),y:cy+r*rv*Math.sin(a)};});
  const path = dpts.map((p,i)=>`${i===0?"M":"L"}${p.x},${p.y}`).join(" ")+"Z";
  return (
    <svg width="260" height="260" viewBox="0 0 260 260" style={{margin:"24px auto",display:"block"}}>
      {web.map((w,i)=><polygon key={i} points={w} fill="none" stroke="#2A2A3E" strokeWidth="1"/>)}
      {pts.map((p,i)=><line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="#2A2A3E" strokeWidth="1"/>)}
      <path d={path} fill="rgba(232,96,60,0.18)" stroke="#E8603C" strokeWidth="2"/>
      {dpts.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r="4" fill="#E8603C"/>)}
      {axes.map((lbl,i)=>{
        const a=(i*2*Math.PI/6)-Math.PI/2;
        const lx=cx+(r+18)*Math.cos(a),ly=cy+(r+18)*Math.sin(a);
        return <text key={i} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fontSize="10" fill="#8888A8" fontFamily="DM Sans,sans-serif" letterSpacing="1">{lbl.toUpperCase()}</text>;
      })}
    </svg>
  );
}

function AnimeImg({ src, alt, className, style }) {
  const [err, setErr] = useState(false);
  if (err || !src) return (
    <div className={className} style={{background:"linear-gradient(135deg,#1C1C28,#2A2A3E)",display:"flex",alignItems:"center",justifyContent:"center",...style}}>
      <span style={{fontSize:"0.65rem",color:"var(--silver)",letterSpacing:"0.1em"}}>NO IMAGE</span>
    </div>
  );
  return <img src={src} alt={alt} className={className} style={style} loading="lazy" onError={()=>setErr(true)}/>;
}

// ── ScrollRow: horizontal list with left/right buttons ───────────────────────
function ScrollRow({ children, className }) {
  const ref = useRef(null);
  const [canLeft,  setCanLeft]  = useState(false);
  const [canRight, setCanRight] = useState(false);

  function checkScroll() {
    const el = ref.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    checkScroll();
    el.addEventListener("scroll", checkScroll, { passive: true });
    const ro = new ResizeObserver(checkScroll);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", checkScroll); ro.disconnect(); };
  }, [children]);

  function scroll(dir) {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * 600, behavior: "smooth" });
  }

  return (
    <div className="scroll-row-wrap">
      <button className="scroll-btn scroll-btn-left"  disabled={!canLeft}  onClick={() => scroll(-1)}>‹</button>
      <div ref={ref} className={`scroll-row ${className || ""}`}>{children}</div>
      <button className="scroll-btn scroll-btn-right" disabled={!canRight} onClick={() => scroll(1)}>›</button>
    </div>
  );
}

// ── TrailerEmbed: YouTube or Dailymotion embed ────────────────────────────────
function TrailerEmbed({ trailer }) {
  const [playing, setPlaying] = useState(false);
  if (!trailer?.id || !trailer?.site) return null;

  let embedUrl = null;
  let thumbUrl = null;

  if (trailer.site === "youtube" || trailer.site === "YouTube") {
    embedUrl = `https://www.youtube.com/embed/${trailer.id}?autoplay=1&rel=0`;
    thumbUrl = `https://img.youtube.com/vi/${trailer.id}/maxresdefault.jpg`;
  } else if (trailer.site === "dailymotion") {
    embedUrl = `https://www.dailymotion.com/embed/video/${trailer.id}?autoplay=1`;
    thumbUrl = `https://www.dailymotion.com/thumbnail/video/${trailer.id}`;
  }

  if (!embedUrl) return null;

  return (
    <div style={{ marginTop: 28 }}>
      <p className="section-sub" style={{ marginBottom: 12 }}>Trailer</p>
      <div className="trailer-wrap">
        {playing ? (
          <iframe src={embedUrl} allowFullScreen allow="autoplay; encrypted-media" title="Trailer" />
        ) : (
          <>
            <img src={thumbUrl} alt="Trailer thumbnail" className="trailer-thumb"
              onClick={() => setPlaying(true)}
              onError={e => { e.target.style.display = "none"; }} />
            <div className="trailer-play" onClick={() => setPlaying(true)}>▶</div>
            <span className="trailer-label">Play Trailer</span>
          </>
        )}
      </div>
    </div>
  );
}

// ENHANCED: DetailOverlay with full AniList data: characters, staff, relations, streaming, tags, studio
function DetailOverlay({ anime, likedAnime, selectedMoods, onClose, onLike, onSave, watchlist, openAnime }) {
  const [recs, setRecs] = useState([]);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const isLiked = likedAnime.some(a=>a.id===anime.id);
  const isSaved = watchlist.some(a=>a.id===anime.id);

  useEffect(()=>{
    document.body.style.overflow="hidden";
    setLoading(true);
    setDetail(null);
    setRecs([]);

    // Fetch full detail + recommendations in parallel
    Promise.all([
      fetchMediaDetail(anime.id),
      fetchRecommendations(anime.id),
    ]).then(([fullMedia, recoRaw]) => {
      setDetail(fullMedia);
      setRecs(recoRaw.map(normalise).filter(Boolean));
    }).catch(()=>{}).finally(()=>setLoading(false));

    return ()=>{ document.body.style.overflow=""; };
  },[anime.id]);

  const characters = detail?.characters?.edges || [];
  const staff = detail?.staff?.edges || [];
  const relations = (detail?.relations?.edges || [])
    .filter(e => e.node.type === "ANIME" && ["PREQUEL","SEQUEL","SIDE_STORY","PARENT","ALTERNATIVE"].includes(e.relationType));
  const streamingEps = detail?.streamingEpisodes || [];

  // Collect streaming external links (Crunchyroll, Netflix, etc.)
  const streamLinks = (detail?.externalLinks || anime.externalLinks || [])
    .filter(l => ["Crunchyroll","Netflix","Funimation","HIDIVE","Amazon Prime Video","Disney+","Hulu"].includes(l.site));

  // AniList page link
  const anilistUrl = `https://anilist.co/anime/${anime.id}`;

  const mainStudio = detail?.studios?.nodes?.[0] || anime.studios?.[0];

  const topTags = (detail?.tags || [])
    .filter(t => !t.isMediaSpoiler && t.rank >= 70)
    .slice(0, 10);

  return (
    <div className="detail-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <button className="detail-close" onClick={onClose}>✕</button>
      <div className="detail-banner">
        <AnimeImg src={anime.banner||anime.image} alt={anime.title} style={{width:"100%",height:"100%",objectFit:"cover",filter:"brightness(0.38)"}}/>
        <div className="detail-banner-overlay"/>
      </div>
      <div className="detail-body">
        <div className="detail-main">
          <AnimeImg src={anime.image} alt={anime.title} className="detail-poster"/>
          <div className="detail-info">
            <h1 className="detail-title">{anime.title}</h1>
            <p className="detail-title-jp">
              {anime.titleJp}
              {mainStudio && (
                <> · <a href={mainStudio.siteUrl||"#"} className="studio-link" target="_blank" rel="noopener noreferrer">{mainStudio.name}</a></>
              )}
            </p>

            <div className="detail-stats">
              <div className="stat-item">
                <div className="stat-val" style={{color:"var(--gold)"}}>{anime.score}</div>
                <div className="stat-lbl">Score</div>
              </div>
              <div className="stat-item">
                <div className="stat-val">{anime.year}</div>
                <div className="stat-lbl">Year</div>
              </div>
              <div className="stat-item">
                <div className="stat-val">{anime.episodes||"—"}</div>
                <div className="stat-lbl">Episodes</div>
              </div>
              <div className="stat-item">
                <div className="stat-val">{computeMatchPct(anime,likedAnime,selectedMoods)}%</div>
                <div className="stat-lbl">Match</div>
              </div>
              {anime.duration && (
                <div className="stat-item">
                  <div className="stat-val">{anime.duration}</div>
                  <div className="stat-lbl">Min/Ep</div>
                </div>
              )}
            </div>

            {/* Genres */}
            <div className="detail-tags">
              {anime.genres.slice(0,6).map(g=><span key={g} className="genre-pill">{g}</span>)}
              {anime.format && <span className="genre-pill" style={{borderColor:"rgba(201,168,76,0.3)",color:"var(--gold)"}}>{FORMAT_LABELS[anime.format]||anime.format}</span>}
              {anime.status && <span className="genre-pill" style={{borderColor:anime.status==="RELEASING"?"rgba(61,168,130,0.4)":"var(--mist)",color:anime.status==="RELEASING"?"var(--jade)":"var(--silver)"}}>{formatStatus(anime.status)}</span>}
              {anime.source && <span className="genre-pill" style={{color:"var(--silver)",opacity:0.7}}>{SOURCE_LABELS[anime.source]||anime.source}</span>}
            </div>

            {/* Synopsis */}
            <p className="synopsis-text">{
              // Use full synopsis from detail if loaded, else fall back to anime.synopsis
              detail?.description
                ? detail.description.replace(/<[^>]+>/g, "").replace(/\n{3,}/g, "\n\n").trim()
                : anime.synopsis
            }</p>

            {/* Tags */}
            {topTags.length > 0 && (
              <div style={{marginTop:12}}>
                {topTags.map(t=><span key={t.name} className="tag-pill">{t.name} <span style={{opacity:0.5}}>{t.rank}%</span></span>)}
              </div>
            )}

            {/* Next episode airing */}
            {anime.nextEpisode && (
              <div style={{marginTop:12,padding:"8px 14px",background:"rgba(74,143,168,0.1)",border:"1px solid rgba(74,143,168,0.25)",borderRadius:3,display:"inline-flex",gap:8,alignItems:"center"}}>
                <span style={{width:6,height:6,borderRadius:"50%",background:"var(--aoi)",flexShrink:0,display:"inline-block"}}/>
                <span style={{fontSize:"0.78rem",color:"var(--aoi)"}}>
                  Ep {anime.nextEpisode.episode} airing in {formatAiringTime(anime.nextEpisode.airingAt)}
                </span>
              </div>
            )}

            {/* Actions */}
            <div className="detail-actions">
              <button className="btn-primary" onClick={()=>onLike(anime)}>
                {isLiked ? "✓ In Profile" : "+ Add to Profile"}
              </button>
              <button className={`btn-watchlist ${isSaved?"saved":""}`} onClick={()=>onSave(anime)}>
                {isSaved ? "✓ Watchlisted" : "＋ Watchlist"}
              </button>
              <a href={anilistUrl} target="_blank" rel="noopener noreferrer"
                style={{padding:"13px 20px",border:"1px solid var(--mist)",color:"var(--silver)",fontSize:"0.78rem",letterSpacing:"0.12em",textTransform:"uppercase",borderRadius:2,transition:"all 0.2s",textDecoration:"none",display:"inline-flex",alignItems:"center",gap:6}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor="var(--pearl)";e.currentTarget.style.color="var(--white)";}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--mist)";e.currentTarget.style.color="var(--silver)";}}>
                AniList ↗
              </a>
            </div>

            {/* Streaming links */}
            {streamLinks.length > 0 && (
              <div className="streaming-links">
                {streamLinks.map(l=>(
                  <a key={l.site} href={l.url} target="_blank" rel="noopener noreferrer" className="stream-link">
                    {l.site}
                  </a>
                ))}
              </div>
            )}

            {/* Trailer */}
            <TrailerEmbed trailer={detail?.trailer || anime.trailer} />
          </div>
        </div>

        {/* Characters */}
        {loading && (
          <div style={{textAlign:"center",padding:"40px 0"}}><div className="spinner"/></div>
        )}

        {!loading && characters.length > 0 && (
          <div style={{marginTop:48}}>
            <p className="section-sub">Characters</p>
            <div className="char-grid">
              {characters.map(edge=>{
                const char = edge.node;
                const va = edge.voiceActors?.[0];
                return (
                  <div key={char.id} className="char-card">
                    <AnimeImg src={char.image?.medium} alt={char.name?.full} className="char-card-img" style={{width:88,height:88,borderRadius:4,objectFit:"cover",border:"1px solid var(--mist)"}}/>
                    <div className="char-card-name">{char.name?.full}</div>
                    <div className="char-card-role">{edge.role?.toLowerCase()}</div>
                    {va && <div className="va-name">{va.name?.full}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Staff */}
        {!loading && staff.length > 0 && (
          <div style={{marginTop:40}}>
            <p className="section-sub">Staff</p>
            <div className="char-grid">
              {staff.map(edge=>(
                <div key={edge.node.id} className="char-card">
                  <AnimeImg src={edge.node.image?.medium} alt={edge.node.name?.full} className="char-card-img" style={{width:88,height:88,borderRadius:4,objectFit:"cover",border:"1px solid var(--mist)"}}/>
                  <div className="char-card-name">{edge.node.name?.full}</div>
                  <div className="char-card-role">{edge.role}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Relations */}
        {!loading && relations.length > 0 && (
          <div style={{marginTop:40}}>
            <p className="section-sub">Related Anime</p>
            <ScrollRow style={{marginTop:12}}>
              {relations.map(edge=>{
                const rel = edge.node;
                return (
                  <div key={rel.id} className="relation-card" onClick={()=>{
                    const basic = normalise({...rel, coverImage:{large:rel.coverImage?.medium}, title:rel.title, id:rel.id, genres:[], status:rel.status, format:rel.format});
                    if (basic) openAnime(basic);
                  }}>
                    <AnimeImg src={rel.coverImage?.medium} alt={rel.title?.english||rel.title?.romaji} className="relation-card-img" style={{width:"100%",aspectRatio:"2/3",objectFit:"cover"}}/>
                    <div className="relation-card-body">
                      <div className="relation-type">{edge.relationType?.replace(/_/g," ")}</div>
                      <div className="relation-title">{rel.title?.english||rel.title?.romaji}</div>
                    </div>
                  </div>
                );
              })}
            </ScrollRow>
          </div>
        )}

        {/* Recommendations */}
        {!loading && recs.length > 0 && (
          <div style={{marginTop:48}}>
            <div className="section-header">
              <h2 className="section-title">AniList Recommendations</h2>
              <div className="section-rule"/>
            </div>
            <ScrollRow>
              {recs.map(r=>(
                <div key={r.id} className="reco-card" onClick={()=>openAnime(r)}>
                  <AnimeImg src={r.image} alt={r.title} className="reco-card-img"/>
                  <div className="reco-card-body">
                    <div className="reco-card-title">{r.title}</div>
                    <div className="reco-card-meta">
                      <span className="reco-score">★ {r.score}</span> · {r.year}
                    </div>
                  </div>
                </div>
              ))}
            </ScrollRow>
          </div>
        )}
      </div>
    </div>
  );
}

// NEW: Watchlist screen
function WatchlistScreen({ watchlist, onRemove, onOpen, onBack }) {
  return (
    <div style={{background:"var(--void)",minHeight:"100vh"}}>
      <div className="watchlist-screen">
        <div className="watchlist-header">
          <button onClick={onBack} style={{fontSize:"0.72rem",letterSpacing:"0.12em",textTransform:"uppercase",color:"var(--silver)",marginBottom:20,display:"flex",alignItems:"center",gap:6}}>← Back</button>
          <h1 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"2.5rem",color:"var(--white)",letterSpacing:"-0.02em"}}>Your Watchlist</h1>
          <p style={{color:"var(--silver)",fontSize:"0.875rem",marginTop:8}}>{watchlist.length} {watchlist.length===1?"title":"titles"} saved for later</p>
        </div>
        {watchlist.length === 0 ? (
          <div className="empty-state">
            <p style={{fontSize:"2rem",marginBottom:12}}>📋</p>
            <p>Nothing saved yet. Hit "Watchlist" on any anime.</p>
          </div>
        ) : (
          <div className="watchlist-grid">
            {watchlist.map(anime=>(
              <div key={anime.id} className="watchlist-item" onClick={()=>onOpen(anime)}>
                <AnimeImg src={anime.image} alt={anime.title} className="watchlist-item-img" style={{width:70,flexShrink:0,aspectRatio:"2/3",objectFit:"cover"}}/>
                <div className="watchlist-item-body">
                  <div className="watchlist-item-title">{anime.title}</div>
                  <div className="watchlist-item-meta">★ {anime.score} · {anime.year} · {anime.episodes||"—"} eps</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:6}}>
                    {anime.genres.slice(0,2).map(g=><span key={g} className="genre-pill" style={{fontSize:"0.6rem",padding:"2px 8px"}}>{g}</span>)}
                  </div>
                  <button className="watchlist-item-remove" onClick={e=>{e.stopPropagation();onRemove(anime);}}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main App
// ─────────────────────────────────────────────────────────────────────────────
export default function MIRAI() {
  const [screen,        setScreen]        = useState("arrival");
  const [engagement,    setEngagement]    = useState(null);
  const [selectedMoods, setSelectedMoods] = useState([]);
  const [likedAnime,    setLikedAnime]    = useState([]);
  const [selectionPool, setSelectionPool] = useState([]);
  const [poolLoading,   setPoolLoading]   = useState(false);
  const [searchQuery,   setSearchQuery]   = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [recommendations, setRecommendations] = useState([]);
  const [recoRows,      setRecoRows]      = useState([]);
  const [recoLoading,   setRecoLoading]   = useState(false);
  const [tasteTraits,   setTasteTraits]   = useState([]);
  const [detailAnime,   setDetailAnime]   = useState(null);
  const [heroAnime,     setHeroAnime]     = useState(null);
  const [apiError,      setApiError]      = useState("");
  const [watchlist,     setWatchlist]     = useState([]);

  // Tab UI state for the Mood screen (must be defined at top-level to keep hooks valid)
  const [moodTab, setMoodTab] = useState("manual");


  // ── AniList Auth state ───────────────────────────────────────────────────
  const [alToken,       setAlToken]       = useState(() => sessionStorage.getItem("al_token") || null);
  const [alUser,        setAlUser]        = useState(null);        // { id, name, avatar }
  const [alWatched,     setAlWatched]     = useState([]);          // normalised completed anime
  const [alFavourites,  setAlFavourites]  = useState([]);          // normalised fav anime
  const [alWatchedIds,  setAlWatchedIds]  = useState(new Set());   // fast exclusion
  const [alLoading,     setAlLoading]     = useState(false);
  const [alGenreProfile, setAlGenreProfile] = useState([]);        // genre taste profile from history
  const [forYouAnime,  setForYouAnime]    = useState([]);          // "For You" recs from AniList history
  const [forYouLoading, setForYouLoading] = useState(false);
  const [forYouError,  setForYouError]    = useState("");
  const searchTimeout = useRef(null);

  // Parse OAuth token — handles both redirect (hash) and popup (custom event) flows
  useEffect(() => {
    async function handleToken() {
      console.log("handleToken: URL", window.location.href);
      // Case 1: Full-page redirect returned with code in query string — exchange it
      const hashToken = await parseAnilistToken();
      console.log("handleToken: got token?", !!hashToken);
      if (hashToken) {
        sessionStorage.setItem("al_token", hashToken);
        setAlToken(hashToken);
        return;
      }
      // Case 2: Already have token in sessionStorage (page reload)
      const stored = sessionStorage.getItem("al_token");
      console.log("handleToken: stored token?", !!stored);
      if (stored && !alToken) setAlToken(stored);
    }
    handleToken();

    // Case 3: Popup dispatched a custom event (for popup flow fallback)
    const handler = (e) => {
      const token = e.detail;
      if (token) setAlToken(token);
    };
    window.addEventListener("al_token_ready", handler);
    return () => window.removeEventListener("al_token_ready", handler);
  }, []);

  // Load user data whenever token appears
  useEffect(() => {
    if (!alToken) return;
    setAlLoading(true);
    fetchViewer(alToken)
      .then(async viewer => {
        setAlUser(viewer);
        const [completed, favs, planning] = await Promise.all([
          fetchUserCompleted(viewer.id, alToken),
          fetchUserFavourites(viewer.id, alToken),
          fetchUserPlanning(viewer.id, alToken),
        ]);
        const normCompleted = completed.map(e => ({ ...normalise(e.media), userScore: e.score })).filter(Boolean);
        const normFavs      = favs.map(normalise).filter(Boolean);
        setAlWatched(normCompleted);
        setAlFavourites(normFavs);
        // Build exclusion set: completed + planning
        const watchedSet = new Set([
          ...completed.map(e => e.mediaId),
          ...planning,
        ]);
        setAlWatchedIds(watchedSet);
        // Build genre taste profile from completed list
        const profile = buildGenreTasteProfile(completed);
        setAlGenreProfile(profile);
        // Auto-seed likedAnime from favourites if not already set
        if (normFavs.length && likedAnime.length === 0) {
          setLikedAnime(normFavs.slice(0, 8));
        }
        // Pre-fetch "For You" recommendations
        if (profile.length > 0) {
          setForYouLoading(true);
          fetchForYouRecs(profile, watchedSet, 30)
            .then(recs => {
              const scored = recs.map(a => ({
                ...a,
                matchPct: Math.min(99, Math.round(
                  55 + (profile.find(p => a.genres.includes(p.genre))?.avgScore || 5) * 4
                )),
              })).sort((a, b) => b.matchPct - a.matchPct);
              setForYouAnime(scored);
            })
            .catch(() => setForYouError("Could not load For You recs."))
            .finally(() => setForYouLoading(false));
        }
      })
      .catch(() => {
        sessionStorage.removeItem("al_token");
        setAlToken(null);
      })
      .finally(() => setAlLoading(false));
  }, [alToken]);

  function alLogout() {
    sessionStorage.removeItem("al_token");
    setAlToken(null);
    setAlUser(null);
    setAlWatched([]);
    setAlFavourites([]);
    setAlWatchedIds(new Set());
    setAlGenreProfile([]);
    setForYouAnime([]);
  }

  // ── AniList Login Banner component (inline) ──────────────────────────────
  const AniListBanner = () => {
    if (alLoading) return (
      <div className="al-banner">
        <div className="spinner" style={{width:24,height:24,margin:0}}/>
        <span style={{fontSize:"0.8rem",color:"var(--silver)"}}>Loading your AniList profile…</span>
      </div>
    );
    if (alUser) return (
      <div className="al-banner">
        {alUser.avatar?.large && <img src={alUser.avatar.large} alt={alUser.name} className="al-avatar"/>}
        <div>
          <div className="al-name">Signed in as {alUser.name}</div>
          <div className="al-sub">AniList data active · recommendations exclude watched anime</div>
        </div>
        <div className="al-stats">
          <div className="al-stat">
            <div className="al-stat-val">{alWatched.length}</div>
            <div className="al-stat-lbl">Watched</div>
          </div>
          <div className="al-stat">
            <div className="al-stat-val">{alFavourites.length}</div>
            <div className="al-stat-lbl">Favourites</div>
          </div>
        </div>
        <button className="al-logout-btn" onClick={alLogout}>Sign Out</button>
      </div>
    );
    return (
      <div className="al-banner">
        <div style={{flex:1}}>
          <div className="al-name">Connect AniList (Optional)</div>
          <div className="al-sub">Sign in to exclude anime you've already watched and personalise from your favourites</div>
        </div>
        <button className="al-login-btn" onClick={anilistLogin}>
          Connect AniList →
        </button>
      </div>
    );
  };

  // Load selection pool when entering selection screen
  useEffect(()=>{
    if (screen !== "selection") return;
    if (selectionPool.length) return;
    setPoolLoading(true);
    setApiError("");
    const genres = selectedMoods.map(m=>MOODS.find(mo=>mo.en===m)?.genre).filter(Boolean);
    const fetcher = genres.length ? fetchByGenres(genres, 24) : fetchPopular(24);
    fetcher
      .then(data=>setSelectionPool(data.map(normalise).filter(Boolean)))
      .catch(e=>setApiError("Could not load anime. " + e.message))
      .finally(()=>setPoolLoading(false));
  },[screen]);

  // Search handler
  function handleSearchChange(e) {
    const q = e.target.value;
    setSearchQuery(q);
    clearTimeout(searchTimeout.current);
    if (!q.trim()) { setSearchResults(null); return; }
    setSearchLoading(true);
    searchTimeout.current = setTimeout(()=>{
      searchAnime(q, 20)
        .then(data=>setSearchResults(data.map(normalise).filter(Boolean)))
        .catch(()=>setSearchResults([]))
        .finally(()=>setSearchLoading(false));
    }, 350);
  }

  function toggleAnime(anime) {
    setLikedAnime(prev=>
      prev.find(a=>a.id===anime.id)
        ? prev.filter(a=>a.id!==anime.id)
        : [...prev, anime]
    );
  }

  function toggleWatchlist(anime) {
    setWatchlist(prev=>
      prev.find(a=>a.id===anime.id)
        ? prev.filter(a=>a.id!==anime.id)
        : [...prev, anime]
    );
  }

  function toggleMood(mood) {
    setSelectedMoods(prev=>
      prev.includes(mood.en) ? prev.filter(m=>m!==mood.en) : [...prev, mood.en]
    );
    setSelectionPool([]);
  }

  // Build recommendations from AniList
  async function handleReveal() {
    setRecoLoading(true);
    const traits = getTasteTraits(likedAnime);
    setTasteTraits(traits);
    try {
      const likedGenres = [...new Set(likedAnime.flatMap(a=>a.genres))];
      const moodGenres  = selectedMoods.map(m=>MOODS.find(mo=>mo.en===m)?.genre).filter(Boolean);
      const allGenres   = [...new Set([...likedGenres,...moodGenres])].slice(0,4);

      // If AniList user: use their favourited anime in chosen genres as seeds
      // then fetch more from those genres
      let genresToFetch = allGenres;
      if (alUser && alFavourites.length > 0 && selectedMoods.length > 0) {
        const moodGenreSet = new Set(moodGenres);
        const favInMood = alFavourites.filter(a => a.genres.some(g => moodGenreSet.has(g)));
        if (favInMood.length > 0) {
          // Derive genres more precisely from matching favourites
          const favGenres = [...new Set(favInMood.flatMap(a => a.genres).filter(g => moodGenreSet.has(g) || likedGenres.includes(g)))];
          genresToFetch = favGenres.length ? favGenres.slice(0,4) : allGenres;
        }
      }

      let recos = [];
      if (genresToFetch.length) {
        const raw = await fetchByGenres(genresToFetch, 40);
        recos = raw.map(normalise).filter(Boolean);
      } else {
        const raw = await fetchPopular(30);
        recos = raw.map(normalise).filter(Boolean);
      }

      // Exclusion: liked + (if logged in) AniList watched + planning
      const likedIds = new Set(likedAnime.map(a=>a.id));
      recos = recos.filter(a => !likedIds.has(a.id) && !alWatchedIds.has(a.id));

      recos = recos.map(a=>({...a, matchPct:computeMatchPct(a,likedAnime,selectedMoods)}))
                   .sort((a,b)=>b.matchPct-a.matchPct);
      setRecommendations(recos);
    } catch(e) {
      setApiError("Could not load recommendations. " + e.message);
    } finally {
      setRecoLoading(false);
    }
    setScreen("reveal");
  }

  // Launch main app with full rows (trending + seasonal + personalised)
  async function launchApp() {
    setRecoLoading(true);
    try {
      const hero = recommendations[0];
      setHeroAnime(hero);

      const likedGenres = [...new Set(likedAnime.flatMap(a=>a.genres))];
      const moodGenres  = selectedMoods.map(m=>MOODS.find(mo=>mo.en===m)?.genre).filter(Boolean);
      // Combined exclusion: liked + AniList watched + planning
      const likedIds    = new Set([...likedAnime.map(a=>a.id), ...alWatchedIds]);
      const currentSeason = getCurrentSeason();

      const topMatches = recommendations.slice(0,12);

      // Determine extra row: if AniList user, show "Based on Your Favourites"
      const extraFetch = alUser && alFavourites.length > 0
        ? (() => {
            const favGenres = [...new Set(alFavourites.flatMap(a=>a.genres))].slice(0,3);
            return favGenres.length ? fetchByGenres(favGenres, 16) : Promise.resolve([]);
          })()
        : Promise.resolve([]);

      const [moodRaw, tasteRaw, trendingRaw, seasonRaw, favsRaw] = await Promise.all([
        moodGenres.length  ? fetchByGenre(moodGenres[0], 1, 14) : Promise.resolve([]),
        likedGenres.length ? fetchByGenre(likedGenres[0], 1, 14) : Promise.resolve([]),
        fetchTrending(16),
        fetchSeasonalAnime(currentSeason.season, currentSeason.year, 16),
        extraFetch,
      ]);

      const process = raw => raw.map(normalise).filter(a => a && !likedIds.has(a.id))
        .map(a => ({...a, matchPct: computeMatchPct(a, likedAnime, selectedMoods)}));

      const moodRow     = process(moodRaw);
      const tasteRow    = process(tasteRaw);
      const trendingRow = process(trendingRaw).map((a,i) => ({...a, trendingRank: i+1}));
      const seasonRow   = process(seasonRaw);
      const favsRow     = process(favsRaw).filter(a => !recommendations.find(r => r.id === a.id));

      const seasonLabel = currentSeason.season.charAt(0) + currentSeason.season.slice(1).toLowerCase();

      const rows = [
        { title: "Your Top Matches",   anime: topMatches,  badge: null },
        { title: "Trending Now",        anime: trendingRow, badge: "live",   showRank: true },
        { title: `${seasonLabel} ${currentSeason.year}`, anime: seasonRow, badge: "season" },
        { title: moodGenres[0] ? `Best ${moodGenres[0]} Anime` : "Popular Picks",    anime: moodRow.length  ? moodRow  : recommendations.slice(4,12),  badge: null },
        { title: likedGenres[0] ? `More ${likedGenres[0]}` : "Highly Rated",         anime: tasteRow.length ? tasteRow : recommendations.slice(8,16), badge: null },
      ];

      // Insert AniList favourites row if signed in
      if (alUser && favsRow.length > 0) {
        rows.splice(1, 0, { title: `Based on Your AniList Favourites`, anime: favsRow.slice(0, 12), badge: "al" });
      }

      setRecoRows(rows);
    } catch(e) {
      setRecoRows([
        { title:"Your Top Matches",       anime: recommendations.slice(0,12) },
        { title:"Highly Rated",           anime: recommendations.slice(4,14) },
        { title:"Discover Something New", anime: recommendations.slice(8,18) },
      ]);
    } finally {
      setRecoLoading(false);
    }
    setScreen("app");
  }

  function resetAll() {
    setScreen("arrival"); setEngagement(null); setSelectedMoods([]);
    setLikedAnime([]); setSelectionPool([]); setSearchQuery(""); setSearchResults(null);
    setRecommendations([]); setRecoRows([]); setTasteTraits([]); setHeroAnime(null); setApiError("");
    // Keep AniList auth — user stays signed in across resets
  }

  // "For You" fast path: skip selection screen, go straight to app with AniList-powered rows
  async function handleRevealForYou() {
    setRecoLoading(true);
    try {
      const topGenres = alGenreProfile.slice(0, 4).map(g => g.genre);
      const currentSeason = getCurrentSeason();
      const seasonLabel = currentSeason.season.charAt(0) + currentSeason.season.slice(1).toLowerCase();

      // Use forYouAnime already fetched, or re-fetch
      let baseRecs = forYouAnime.length > 0 ? forYouAnime : [];
      if (!baseRecs.length && topGenres.length) {
        const raw = await fetchByGenres(topGenres, 40);
        baseRecs = raw.map(normalise).filter(a => a && !alWatchedIds.has(a.id));
      }

      const hero = baseRecs[0];
      setHeroAnime(hero);
      setRecommendations(baseRecs);

      const [trendingRaw, seasonRaw, secondaryRaw] = await Promise.all([
        fetchTrending(16),
        fetchSeasonalAnime(currentSeason.season, currentSeason.year, 16),
        alGenreProfile.length > 1
          ? fetchByGenre(alGenreProfile[1].genre, 1, 14)
          : Promise.resolve([]),
      ]);

      const process = raw =>
        raw.map(normalise).filter(a => a && !alWatchedIds.has(a.id))
          .map(a => ({...a, matchPct: computeMatchPct(a, likedAnime, [])}));

      const trendingRow = process(trendingRaw).map((a,i) => ({...a, trendingRank: i+1}));
      const seasonRow   = process(seasonRaw);
      const secondaryRow = process(secondaryRaw);

      // Top matches = baseRecs scored by genre profile
      const topMatches = baseRecs.slice(0, 12).map(a => ({
        ...a,
        matchPct: Math.min(99, Math.round(
          55 + (alGenreProfile.find(p => a.genres.includes(p.genre))?.avgScore || 5) * 4
        )),
      }));

      const rows = [
        { title: "For You",            anime: topMatches,   badge: "al" },
        { title: "Trending Now",        anime: trendingRow,  badge: "live", showRank: true },
        { title: `${seasonLabel} ${currentSeason.year}`, anime: seasonRow, badge: "season" },
      ];

      if (secondaryRow.length > 0 && alGenreProfile[1]) {
        rows.push({ title: `More ${alGenreProfile[1].genre}`, anime: secondaryRow, badge: null });
      }

      // Add favourites row if available
      if (alFavourites.length > 0) {
        const favGenres = [...new Set(alFavourites.flatMap(a => a.genres))].slice(0, 3);
        if (favGenres.length) {
          const favRaw = await fetchByGenres(favGenres, 16);
          const favRow = favRaw.map(normalise).filter(a => a && !alWatchedIds.has(a.id))
            .map(a => ({...a, matchPct: computeMatchPct(a, alFavourites, [])}));
          if (favRow.length > 0) {
            rows.splice(1, 0, { title: "Based on Your Favourites", anime: favRow.slice(0, 12), badge: "al" });
          }
        }
      }

      setRecoRows(rows);
      setTasteTraits(alGenreProfile.slice(0, 4).map(g =>
        ({
          Action:"High-energy storytelling", Drama:"Emotionally resonant narratives",
          Mystery:"Psychological complexity", Fantasy:"Imaginative world-building",
          "Sci-Fi":"Conceptual depth & ideas", Romance:"Character-driven intimacy",
          "Slice of Life":"Quiet, reflective moments", Comedy:"Warm, light-hearted tone",
        }[g.genre] || g.genre)
      ).filter(Boolean));
    } catch(e) {
      setRecoRows([{ title:"For You", anime: forYouAnime.slice(0, 12), badge: "al" }]);
    } finally {
      setRecoLoading(false);
    }
    setScreen("app");
  }

  const displayPool = searchResults ?? selectionPool;

  const trayMsg = (()=>{
    const n=likedAnime.length;
    if(n===0) return "Select at least one anime to continue.";
    if(n===1) return "Good start. Add more for better matches.";
    if(n<4)   return "We're learning your taste…";
    if(n<7)   return "Your profile is taking shape.";
    return "Excellent taste. This will be precise.";
  })();

  // ─────────────────────────────────────────────────────────────────────────
  // SCREEN: ARRIVAL
  // ─────────────────────────────────────────────────────────────────────────
  if (screen==="arrival") return (
    <>
      <style>{CSS}</style>
      <div className="screen" style={{background:"var(--void)"}}>
        <div className="arrival-bg"/>
        <Particles count={50}/>
        <div className="arrival-content">
          <div className="stagger" style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
            <div className="logo-mark">MIRAI</div>
            <div className="logo-jp">未来</div>
            <div className="logo-rule"/>
            <p className="tagline">"Find the anime you haven't met yet."</p>
          </div>
          <button className="begin-btn" onClick={()=>setScreen("invitation")}>Begin</button>
        </div>
      </div>
    </>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // SCREEN: INVITATION
  // ─────────────────────────────────────────────────────────────────────────
  if (screen==="invitation") return (
    <>
      <style>{CSS}</style>
      <div className="screen" style={{background:"var(--void)"}}>
        <div className="screen-content stagger">
          <h1 className="screen-title">How do you<br/>experience anime?</h1>
          {ENGAGEMENT_CHOICES.map(c=>(
            <button key={c.label} className={`choice-card ${engagement===c.label?"selected":""}`}
              onClick={()=>{ setEngagement(c.label); setTimeout(()=>setScreen("mood"),350); }}>
              <span className="choice-dot"/>
              <div>
                <span className="choice-label">{c.label}</span>
                <span style={{fontSize:"0.9rem"}}>{c.sub}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // SCREEN: MOOD
  // ─────────────────────────────────────────────────────────────────────────
  if (screen==="mood") {
    const canForYou = !!alUser && alGenreProfile.length > 0;

    return (
    <>
      <style>{CSS}</style>
      <div style={{background:"var(--void)",minHeight:"100vh",paddingTop:80,paddingBottom:80,display:"flex",flexDirection:"column",alignItems:"center"}}>
        <div style={{textAlign:"center",marginBottom:24,width:"100%",maxWidth:640,padding:"0 24px"}}>
          <h1 className="screen-title" style={{marginBottom:8}}>What draws you in?</h1>
          <p className="screen-subtitle">Choose your mood — we'll find anime of that genre.</p>
        </div>

        {/* AniList Banner */}
        <div style={{width:"100%",maxWidth:640,padding:"0 24px",marginBottom:0}}>
          <AniListBanner/>
        </div>

        {/* Tab switcher */}
        <div style={{width:"100%",maxWidth:640,padding:"0 24px",marginBottom:28}}>
          <div style={{display:"flex",gap:0,borderRadius:4,overflow:"hidden",border:"1px solid var(--mist)"}}>
            <button
              onClick={()=>setMoodTab("manual")}
              style={{
                flex:1, padding:"12px 0", fontSize:"0.72rem", letterSpacing:"0.14em",
                textTransform:"uppercase", transition:"all 0.2s",
                background: moodTab==="manual" ? "var(--ember)" : "var(--obsidian)",
                color: moodTab==="manual" ? "var(--white)" : "var(--silver)",
                borderRight:"1px solid var(--mist)",
              }}>
              ✦ Choose Mood
            </button>
            <button
              onClick={()=>{ if(canForYou || alUser) setMoodTab("foryou"); else anilistLogin(); }}
              style={{
                flex:1, padding:"12px 0", fontSize:"0.72rem", letterSpacing:"0.14em",
                textTransform:"uppercase", transition:"all 0.2s", position:"relative",
                background: moodTab==="foryou" ? "linear-gradient(135deg,#1a1230,#0e1a2a)" : "var(--obsidian)",
                color: moodTab==="foryou" ? "var(--aoi)" : "var(--silver)",
                border:"none",
              }}>
              {!alUser ? "★ For You · Connect AniList" : canForYou ? "★ For You" : (alLoading ? "★ Loading…" : "★ For You")}
              {!alUser && (
                <span style={{position:"absolute",top:3,right:6,fontSize:"0.55rem",background:"var(--aoi)",color:"#000",padding:"1px 5px",borderRadius:2,letterSpacing:"0.06em"}}>NEW</span>
              )}
            </button>
          </div>
        </div>

        {/* ── Tab: Manual mood picker ── */}
        {moodTab === "manual" && (
          <>
            <div className="mood-grid stagger">
              {MOODS.map(m=>(
                <button key={m.en}
                  className={`mood-card ${selectedMoods.includes(m.en)?"selected":""}`}
                  style={{background:selectedMoods.includes(m.en)?m.bg:"var(--obsidian)",color:m.color,borderColor:selectedMoods.includes(m.en)?m.color:"transparent"}}
                  onClick={()=>toggleMood(m)}>
                  <span className="mood-jp">{m.jp}</span>
                  <span className="mood-en" style={{color:m.color}}>{m.en}</span>
                  <span className="mood-sub">{m.sub} · {m.genre}</span>
                  <span className="mood-check">✓</span>
                </button>
              ))}
            </div>
            <button className={`continue-btn ${selectedMoods.length>0?"visible":""}`}
              onClick={()=>setScreen("selection")} style={{marginTop:48}}>
              Continue →
            </button>
          </>
        )}

        {/* ── Tab: For You (AniList-powered) ── */}
        {moodTab === "foryou" && (
          <div style={{width:"100%",maxWidth:860,padding:"0 24px"}}>
            {!alUser && (
              <div style={{textAlign:"center",padding:"48px 24px"}}>
                <div style={{fontSize:"2.5rem",marginBottom:12}}>★</div>
                <h2 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"1.8rem",color:"var(--white)",marginBottom:12}}>Personalised For You</h2>
                <p style={{fontSize:"0.875rem",color:"var(--silver)",marginBottom:24,maxWidth:400,margin:"0 auto 24px"}}>
                  Connect your AniList account to get recommendations built from your actual watch history — genres you love, anime you haven't seen yet.
                </p>
                <button className="al-login-btn" style={{margin:"0 auto",display:"block"}} onClick={anilistLogin}>
                  Connect AniList →
                </button>
              </div>
            )}

            {alUser && alLoading && (
              <div style={{textAlign:"center",padding:"48px 0"}}>
                <div className="spinner"/>
                <p style={{color:"var(--silver)",fontSize:"0.875rem"}}>Analysing your watch history…</p>
              </div>
            )}

            {alUser && !alLoading && alGenreProfile.length === 0 && (
              <div style={{textAlign:"center",padding:"48px 24px"}}>
                <p style={{color:"var(--silver)",fontSize:"0.875rem"}}>Not enough completed anime found to build a taste profile. Try the manual mood picker instead.</p>
              </div>
            )}

            {alUser && !alLoading && alGenreProfile.length > 0 && (
              <>
                {/* Taste profile bars */}
                <div style={{marginBottom:32}}>
                  <p style={{fontSize:"0.65rem",letterSpacing:"0.18em",textTransform:"uppercase",color:"var(--ember)",marginBottom:16}}>
                    Your Taste Profile · based on {alWatched.length} completed anime
                  </p>
                  <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:20}}>
                    {alGenreProfile.slice(0,8).map((g,i)=>(
                      <div key={g.genre} style={{flex:"1 1 auto",minWidth:140}}>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                          <span style={{fontSize:"0.7rem",color:"var(--pearl)",letterSpacing:"0.06em"}}>{g.genre}</span>
                          <span style={{fontSize:"0.65rem",color:"var(--silver)"}}>{g.count} watched · {g.avgScore.toFixed(1)}/10</span>
                        </div>
                        <div style={{height:3,borderRadius:2,background:"var(--mist)",overflow:"hidden"}}>
                          <div style={{
                            height:"100%", borderRadius:2,
                            width:`${Math.min(100,(g.avgScore/10)*100)}%`,
                            background:`linear-gradient(90deg,var(--ember),var(--gold))`,
                            transition:"width 0.8s var(--ease-cinema)",
                          }}/>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* For You anime grid */}
                {forYouLoading && (
                  <div style={{textAlign:"center",padding:"32px 0"}}>
                    <div className="spinner"/>
                    <p style={{color:"var(--silver)",fontSize:"0.875rem"}}>Finding your perfect matches…</p>
                  </div>
                )}

                {!forYouLoading && forYouAnime.length > 0 && (
                  <>
                    <p style={{fontSize:"0.65rem",letterSpacing:"0.18em",textTransform:"uppercase",color:"var(--silver)",marginBottom:16}}>
                      Recommended · {forYouAnime.length} titles you haven't watched
                    </p>
                    <div className="anime-grid" style={{marginBottom:80}}>
                      {forYouAnime.slice(0,24).map((anime,i)=>{
                        const sel = likedAnime.some(a=>a.id===anime.id);
                        return (
                          <div key={anime.id} className="anime-card-wrap" style={{animationDelay:`${i*30}ms`}}>
                            <div className={`anime-card ${sel?"selected":""}`} onClick={()=>toggleAnime(anime)}>
                              <AnimeImg src={anime.image} alt={anime.title}
                                style={{width:"100%",height:"100%",objectFit:"cover",filter:sel?"saturate(1.05)":"saturate(0.85)"}}/>
                              <div className="anime-card-overlay">
                                <div className="anime-card-title">{anime.title}</div>
                                <div className="anime-card-meta">★ {anime.score} · {anime.year}</div>
                              </div>
                              <div className="match-pct" style={{top:8,right:8,position:"absolute"}}>{anime.matchPct}%</div>
                              <div className="anime-card-check">✓</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="tray">
                      <div className="tray-inner">
                        {likedAnime.length>0 && (
                          <div className="tray-thumbs">
                            {likedAnime.slice(0,5).map(a=>(
                              <AnimeImg key={a.id} src={a.image} alt={a.title} className="tray-thumb"/>
                            ))}
                            {likedAnime.length>5 && (
                              <div className="tray-thumb" style={{background:"var(--mist)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.7rem",color:"var(--silver)"}}>
                                +{likedAnime.length-5}
                              </div>
                            )}
                          </div>
                        )}
                        <span className="tray-msg">{
                          likedAnime.length === 0
                            ? "Select any that interest you to refine further — or skip straight to results."
                            : `${likedAnime.length} selected · ready to reveal.`
                        }</span>
                        <button className="reveal-btn" onClick={handleRevealForYou}>
                          {recoLoading ? "Loading…" : "See My Picks →"}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SCREEN: WATCHLIST
  // ─────────────────────────────────────────────────────────────────────────
  if (screen==="watchlist") return (
    <>
      <style>{CSS}</style>
      <nav className="nav">
        <div className="nav-logo">MIRAI <span>未来</span></div>
        <div className="nav-links">
          <span className="nav-link" onClick={()=>setScreen("app")}>Discover</span>
          <span className="nav-link" onClick={()=>setScreen("selection")}>Refine Taste</span>
          <span className="nav-link" onClick={()=>setScreen("reveal")}>Profile</span>
          <span className="nav-link active">
            Watchlist
            {watchlist.length>0 && <span className="nav-watchlist-badge">{watchlist.length}</span>}
          </span>
        </div>
        <button className="nav-reset" onClick={resetAll}>↺ Reset</button>
      </nav>
      <WatchlistScreen
        watchlist={watchlist}
        onRemove={toggleWatchlist}
        onOpen={setDetailAnime}
        onBack={()=>setScreen("app")}
      />
      {detailAnime && (
        <DetailOverlay
          anime={detailAnime}
          likedAnime={likedAnime}
          selectedMoods={selectedMoods}
          onClose={()=>setDetailAnime(null)}
          onLike={toggleAnime}
          onSave={toggleWatchlist}
          watchlist={watchlist}
          openAnime={setDetailAnime}
        />
      )}
    </>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // SCREEN: SELECTION
  // ─────────────────────────────────────────────────────────────────────────
  if (screen==="selection") return (
    <>
      <style>{CSS}</style>
      <div style={{background:"var(--void)",minHeight:"100vh"}}>
        <div className="selection-screen">
          <div className="selection-header">
            <div className="logo-mark" style={{fontSize:"1.8rem"}}>MIRAI</div>
            <h1 className="screen-title" style={{marginTop:20,marginBottom:6}}>Show me your taste.</h1>
            <p className="screen-subtitle" style={{marginBottom:16}}>
              {selectedMoods.length
                ? `Showing ${selectedMoods.map(m=>MOODS.find(mo=>mo.en===m)?.genre).filter(Boolean).join(", ")} anime · search to find others`
                : "Select anime you've enjoyed · the more you choose, the more precise we become."}
            </p>
            <AniListBanner/>
          </div>

          <div className="search-wrap">
            <input type="text" className="search-input"
              placeholder="探す · Search any anime on AniList…"
              value={searchQuery} onChange={handleSearchChange}/>
            <span style={{position:"absolute",right:18,top:"50%",transform:"translateY(-50%)",color:"var(--silver)"}}>
              {searchLoading ? "…" : "⌕"}
            </span>
          </div>

          {apiError && (
            <div style={{textAlign:"center",padding:"32px 0",color:"var(--silver)"}}>
              <p style={{fontSize:"0.875rem"}}>{apiError}</p>
              <button className="btn-primary" style={{marginTop:16,display:"inline-block"}} onClick={()=>{setApiError("");setSelectionPool([]);setScreen("selection");}}>Retry</button>
            </div>
          )}

          {poolLoading ? (
            <div className="loading-grid">
              {Array.from({length:16}).map((_,i)=>(
                <div key={i} className="loading-card" style={{animationDelay:`${i*60}ms`}}/>
              ))}
            </div>
          ) : (
            <div className="anime-grid">
              {displayPool.map((anime,i)=>{
                const sel=likedAnime.some(a=>a.id===anime.id);
                return (
                  <div key={anime.id} className="anime-card-wrap" style={{animationDelay:`${i*35}ms`}}>
                    <div className={`anime-card ${sel?"selected":""}`} onClick={()=>toggleAnime(anime)}>
                      <AnimeImg src={anime.image} alt={anime.title}
                        style={{width:"100%",height:"100%",objectFit:"cover",filter:sel?"saturate(1.05)":"saturate(0.85)"}}/>
                      <div className="anime-card-overlay">
                        <div className="anime-card-title">{anime.title}</div>
                        <div className="anime-card-meta">★ {anime.score} · {anime.year}</div>
                      </div>
                      <div className="anime-card-check">✓</div>
                    </div>
                  </div>
                );
              })}
              {!displayPool.length && !poolLoading && !apiError && (
                <div className="empty-state" style={{gridColumn:"1/-1"}}>
                  <p>No results found. Try a different search.</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="tray">
          <div className="tray-inner">
            {likedAnime.length>0 && (
              <div className="tray-thumbs">
                {likedAnime.slice(0,5).map(a=>(
                  <AnimeImg key={a.id} src={a.image} alt={a.title} className="tray-thumb"/>
                ))}
                {likedAnime.length>5 && (
                  <div className="tray-thumb" style={{background:"var(--mist)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.7rem",color:"var(--silver)"}}>
                    +{likedAnime.length-5}
                  </div>
                )}
              </div>
            )}
            <span className="tray-msg">{trayMsg}</span>
            <button className="reveal-btn" disabled={likedAnime.length===0||recoLoading} onClick={handleReveal}>
              {recoLoading ? "Loading…" : "Reveal Recommendations"}
            </button>
          </div>
        </div>
      </div>
    </>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // SCREEN: REVEAL (Taste Profile)
  // ─────────────────────────────────────────────────────────────────────────
  if (screen==="reveal") return (
    <>
      <style>{CSS}</style>
      <div className="screen" style={{background:"var(--void)",padding:"80px 24px"}}>
        <div className="fade-in" style={{textAlign:"center",maxWidth:560,width:"100%"}}>
          <p style={{fontSize:"0.7rem",letterSpacing:"0.18em",textTransform:"uppercase",color:"var(--ember)",marginBottom:12}}>Your Taste Profile</p>
          <h1 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"2.75rem",color:"var(--white)",letterSpacing:"-0.02em",marginBottom:0}}>Your Anime Soul</h1>

          <RadarChart likedAnime={likedAnime}/>

          <p style={{fontSize:"0.8rem",letterSpacing:"0.1em",textTransform:"uppercase",color:"var(--silver)",marginBottom:16}}>Dominant themes detected</p>
          <ul className="trait-list">
            {tasteTraits.map(t=>(
              <li key={t} className="trait-item"><span className="trait-dot"/>{t}</li>
            ))}
          </ul>

          <div style={{marginTop:24,display:"flex",flexWrap:"wrap",justifyContent:"center",gap:8}}>
            {[...new Set(likedAnime.flatMap(a=>a.genres))].slice(0,6).map(g=>(
              <span key={g} className="profile-pill">{g}</span>
            ))}
          </div>

          <div style={{marginTop:16,textAlign:"center"}}>
            <p style={{fontSize:"0.75rem",color:"var(--silver)",marginBottom:8}}>Taste Strength · {likedAnime.length} anime selected</p>
            <div style={{height:4,borderRadius:2,background:"var(--mist)",maxWidth:320,margin:"0 auto",overflow:"hidden"}}>
              <div className="strength-bar" style={{width:`${Math.min(likedAnime.length/10*100,100)}%`}}/>
            </div>
          </div>

          <div style={{display:"flex",gap:12,justifyContent:"center",marginTop:48}}>
            <button className="begin-btn" style={{opacity:1,animation:"none"}} onClick={()=>setScreen("selection")}>← Refine</button>
            <button className="begin-btn" style={{opacity:1,animation:"none",borderColor:"var(--ember)",color:"var(--ember)"}} onClick={launchApp}>
              {recoLoading ? "Loading…" : "See My Recommendations →"}
            </button>
          </div>
        </div>
      </div>
    </>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // SCREEN: MAIN APP
  // ─────────────────────────────────────────────────────────────────────────
  const heroRec = heroAnime || recommendations[0];

  return (
    <>
      <style>{CSS}</style>
      <div className="app-shell fade-in">
        <nav className="nav">
          <div className="nav-logo">MIRAI <span>未来</span></div>
          <div className="nav-links">
            <span className="nav-link active">Discover</span>
            <span className="nav-link" onClick={()=>setScreen("selection")}>Refine Taste</span>
            <span className="nav-link" onClick={()=>setScreen("reveal")}>Profile</span>
            <span className="nav-link" onClick={()=>setScreen("watchlist")}>
              Watchlist
              {watchlist.length>0 && <span className="nav-watchlist-badge">{watchlist.length}</span>}
            </span>
          </div>
          <button className="nav-reset" onClick={resetAll}>↺ Reset</button>
        </nav>

        {heroRec && (
          <section className="hero">
            <div className="hero-bg">
              <AnimeImg src={heroRec.banner||heroRec.image} alt={heroRec.title}
                style={{width:"100%",height:"100%",objectFit:"cover",filter:"brightness(0.45) saturate(0.9)"}}/>
            </div>
            <div className="hero-overlay"/>
            <div className="hero-content">
              <div className="hero-badge">
                <span className="hero-badge-dot"/>
                Your #1 Match · {heroRec.matchPct||"—"}% Aligned
              </div>
              <h1 className="hero-title">{heroRec.title}</h1>
              <p className="hero-title-jp" style={{fontFamily:"'Noto Serif JP',serif",fontWeight:300}}>
                {heroRec.titleJp} · {heroRec.genres?.slice(0,3).join(" · ")}
              </p>
              <div className="hero-meta">
                <div className="hero-meta-item"><strong>★ {heroRec.score}</strong> Score</div>
                <div className="hero-meta-item"><strong>{heroRec.year}</strong></div>
                <div className="hero-meta-item"><strong>{heroRec.episodes||"—"}</strong> Episodes</div>
              </div>
              <p className="hero-synopsis">{heroRec.synopsis}</p>
              <div className="hero-cta">
                <button className="btn-primary" onClick={()=>setDetailAnime(heroRec)}>Explore →</button>
                <button className={`btn-watchlist ${watchlist.some(a=>a.id===heroRec.id)?"saved":""}`}
                  onClick={()=>toggleWatchlist(heroRec)}>
                  {watchlist.some(a=>a.id===heroRec.id) ? "✓ Watchlisted" : "＋ Watchlist"}
                </button>
              </div>
            </div>
            <div className="hero-scroll">
              <div className="hero-scroll-line"/>
              <span style={{fontSize:"0.65rem",letterSpacing:"0.1em",color:"var(--silver)",textTransform:"uppercase"}}>Scroll</span>
            </div>
          </section>
        )}

        {recoLoading ? (
          <div style={{textAlign:"center",padding:"80px 24px"}}>
            <div className="spinner"/>
            <p style={{color:"var(--silver)",fontSize:"0.875rem"}}>Fetching your recommendations from AniList…</p>
          </div>
        ) : (
          recoRows.map((row,ri)=>(
            row.anime.length > 0 && (
              <section key={ri} className="section">
                <div className="section-header">
                  <h2 className="section-title">{row.title}</h2>
                  {row.badge && <span className={`section-badge ${row.badge}`}>
                    {row.badge==="live" ? "● Live" : row.badge==="season" ? "🌸 Seasonal" : row.badge==="al" && row.title==="For You" ? "★ For You" : row.badge==="al" ? "⭐ AniList" : ""}
                  </span>}
                  <div className="section-meta">{row.anime.length} titles</div>
                  <div className="section-rule"/>
                </div>
                <ScrollRow>
                  {row.anime.map((anime,idx)=>(
                    <div key={anime.id} className="reco-card" onClick={()=>setDetailAnime(anime)}>
                      <AnimeImg src={anime.image} alt={anime.title} className="reco-card-img"/>
                      {row.showRank && anime.trendingRank && (
                        <div className="trending-rank">#{anime.trendingRank}</div>
                      )}
                      {!row.showRank && anime.matchPct && (
                        <div className="match-pct">{anime.matchPct}%</div>
                      )}
                      {anime.nextEpisode && (
                        <div className="airing-badge">
                          Ep {anime.nextEpisode.episode} · {formatAiringTime(anime.nextEpisode.airingAt)}
                        </div>
                      )}
                      <div className="reco-card-body">
                        <div className="reco-card-title">{anime.title}</div>
                        <div className="reco-card-meta">
                          <span className="reco-score">★ {anime.score}</span> · {anime.year}
                        </div>
                      </div>
                    </div>
                  ))}
                </ScrollRow>
              </section>
            )
          ))
        )}

        <footer style={{textAlign:"center",padding:"60px 24px",borderTop:"1px solid var(--mist)"}}>
          <div className="logo-mark" style={{fontSize:"2rem",marginBottom:8}}>MIRAI</div>
          <p style={{fontSize:"0.75rem",color:"var(--silver)",letterSpacing:"0.05em"}}>未来 · Data powered by AniList GraphQL API</p>
        </footer>
      </div>

      {detailAnime && (
        <DetailOverlay
          anime={detailAnime}
          likedAnime={likedAnime}
          selectedMoods={selectedMoods}
          onClose={()=>setDetailAnime(null)}
          onLike={toggleAnime}
          onSave={toggleWatchlist}
          watchlist={watchlist}
          openAnime={setDetailAnime}
        />
      )}
    </>
  );
}
