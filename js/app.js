const LANGS = ["en", "he", "ar"];
const RTL = new Set(["he", "ar"]);
const STORAGE_KEY = "cb-lang";

const state = {
  lang: "en",
  data: null,
};

function getArtistSlug() {
  const params = new URLSearchParams(window.location.search);
  return params.get("artist");
}

function preferredLang() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (LANGS.includes(stored)) return stored;
  const nav = (navigator.language || "en").toLowerCase();
  if (nav.startsWith("he")) return "he";
  if (nav.startsWith("ar")) return "ar";
  return "en";
}

function setLang(lang) {
  if (!LANGS.includes(lang)) return;
  state.lang = lang;
  localStorage.setItem(STORAGE_KEY, lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = RTL.has(lang) ? "rtl" : "ltr";

  document.querySelectorAll(".lang-switch button").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.dataset.lang === lang));
  });

  render();
}

function ui(key) {
  return state.data?.exhibition?.[state.lang]?.[key] ?? "";
}

function artistCopy(artist) {
  return artist?.[state.lang] ?? artist?.en ?? {};
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function paragraphs(text) {
  return String(text || "")
    .split(/\n+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `<p>${escapeHtml(part)}</p>`)
    .join("");
}

function renderHome() {
  const artists = state.data.artists;
  const cards = artists
    .map((artist) => {
      const copy = artistCopy(artist);
      return `
        <li>
          <a class="artist-card" href="./?artist=${encodeURIComponent(artist.slug)}">
            <img src="${escapeHtml(artist.cover)}" alt="" loading="lazy" width="72" height="72" />
            <div>
              <h2>${escapeHtml(copy.title)}</h2>
              <p>${escapeHtml(copy.subtitle)}</p>
            </div>
          </a>
        </li>
      `;
    })
    .join("");

  return `
    <section class="hero">
      <h1 data-i18n="name">${escapeHtml(ui("name"))}</h1>
      <p class="tagline" data-i18n="tagline">${escapeHtml(ui("tagline"))}</p>
      <p class="intro" data-i18n="homeIntro">${escapeHtml(ui("homeIntro"))}</p>
    </section>
    <h2 class="section-title" data-i18n="artistsHeading">${escapeHtml(ui("artistsHeading"))}</h2>
    <ul class="artist-grid">${cards}</ul>
  `;
}

function renderArtist(slug) {
  const artist = state.data.artists.find((item) => item.slug === slug);
  if (!artist) {
    return `<p class="error">${escapeHtml(ui("notFound"))}</p>`;
  }

  const copy = artistCopy(artist);
  const gallery = (artist.gallery || [])
    .map(
      (src, index) =>
        `<img src="${escapeHtml(src)}" alt="${escapeHtml(copy.title)} — ${index + 1}" loading="lazy" />`
    )
    .join("");

  document.title = `${copy.title} · ${ui("name")}`;

  return `
    <article class="artist-page">
      <a class="back-link" href="./">← ${escapeHtml(ui("backHome"))}</a>
      <div class="cover-frame">
        <img src="${escapeHtml(artist.cover)}" alt="${escapeHtml(copy.title)}" />
      </div>
      <h1>${escapeHtml(copy.title)}</h1>
      <p class="subtitle">${escapeHtml(copy.subtitle)}</p>
      <section class="bio">
        <span class="label">${escapeHtml(ui("bioLabel"))}</span>
        <div>${paragraphs(copy.bio)}</div>
      </section>
      <section class="body-text">${paragraphs(copy.body)}</section>
      <h2 class="section-title">${escapeHtml(ui("galleryLabel"))}</h2>
      <div class="gallery">${gallery}</div>
    </article>
  `;
}

function render() {
  const main = document.querySelector("#main");
  if (!main || !state.data) return;

  document.title = ui("name");
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (key) el.textContent = ui(key);
  });

  const slug = getArtistSlug();
  main.innerHTML = slug ? renderArtist(slug) : renderHome();
}

async function boot() {
  document.querySelectorAll(".lang-switch button").forEach((btn) => {
    btn.addEventListener("click", () => setLang(btn.dataset.lang));
  });

  try {
    const response = await fetch("./data/artists.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.data = await response.json();
    setLang(preferredLang());
  } catch (error) {
    const main = document.querySelector("#main");
    if (main) {
      main.innerHTML = `<p class="error">Could not load exhibition data.</p>`;
    }
    console.error(error);
  }
}

boot();
