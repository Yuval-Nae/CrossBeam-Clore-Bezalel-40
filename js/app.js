const LANGS = ["en", "ar", "he"];
const RTL = new Set(["he", "ar"]);
const STORAGE_KEY = "cb-lang";

const COPY = {
  en: { search: "Search artists", empty: "No artists match.", back: "All artists" },
  he: { search: "חיפוש אמנים", empty: "לא נמצאו אמנים.", back: "כל האמנים" },
  ar: { search: "البحث عن الفنانين", empty: "لا يوجد فنانون.", back: "كل الفنانين" },
};

const state = {
  lang: "en",
  data: null,
  query: "",
  searching: false,
  galleryIndex: 0,
};

const searchIcon = `<svg class="search-toggle" viewBox="0 0 22 22" width="22" height="22" aria-hidden="true"><circle cx="9" cy="9" r="6.25" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M14 14.5 L20 20.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
const arrowIcon = `<svg class="arrow" viewBox="0 0 20 20" width="19" height="19" aria-hidden="true"><path d="M4 4 L15 15 M7.5 15 H15 V7.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="miter"/></svg>`;

function preferredLang() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (LANGS.includes(stored)) return stored;
  const nav = (navigator.language || "en").toLowerCase();
  if (nav.startsWith("he")) return "he";
  if (nav.startsWith("ar")) return "ar";
  return "en";
}

function artistSlug() {
  return new URLSearchParams(window.location.search).get("artist");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function nameOrder(lang) {
  return [lang, ...LANGS.filter((item) => item !== lang)];
}

function field(record, lang) {
  return record?.[lang] || record?.en || "";
}

function setLang(lang) {
  if (!LANGS.includes(lang)) return;
  state.lang = lang;
  localStorage.setItem(STORAGE_KEY, lang);
  document.documentElement.lang = lang;
  document.querySelectorAll(".lang-switch button").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.lang === lang));
  });
  render();
}

function matches(artist, query) {
  if (!query) return true;
  const haystack = LANGS.map((lang) => artist.name[lang] || "").join(" ").toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function renderHeaderStart() {
  const slot = document.querySelector("#header-start");
  const slug = artistSlug();
  if (slug) {
    slot.innerHTML = `<a class="icon-button" href="./" aria-label="${escapeHtml(COPY[state.lang].back)}">&lt;</a>`;
    return;
  }
  if (state.searching) {
    slot.innerHTML = `<input class="search-field" type="search" value="${escapeHtml(state.query)}" aria-label="${escapeHtml(COPY[state.lang].search)}" />`;
    const input = slot.querySelector("input");
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    input.addEventListener("input", () => {
      state.query = input.value;
      renderList();
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        state.searching = false;
        state.query = "";
        render();
      }
    });
    return;
  }
  slot.innerHTML = `<button class="icon-button" type="button" aria-label="${escapeHtml(COPY[state.lang].search)}">${searchIcon}</button>`;
  slot.querySelector("button").addEventListener("click", () => {
    state.searching = true;
    render();
  });
}

function renderList() {
  const list = document.querySelector(".cards");
  if (!list || !state.data) return;
  const artists = state.data.artists.filter((artist) => matches(artist, state.query.trim()));
  if (!artists.length) {
    list.innerHTML = `<li><p class="empty">${escapeHtml(COPY[state.lang].empty)}</p></li>`;
    return;
  }
  list.innerHTML = artists
    .map((artist) => {
      const names = nameOrder(state.lang)
        .map((lang) => {
          const dir = RTL.has(lang) ? "rtl" : "ltr";
          return `<p class="${lang}" dir="${dir}">${escapeHtml(artist.name[lang])}</p>`;
        })
        .join("");
      return `<li><a class="card" href="./?artist=${encodeURIComponent(artist.slug)}"><span class="card-main"><img src="${escapeHtml(artist.portrait)}" alt="" /><span class="names">${names}</span></span>${arrowIcon}</a></li>`;
    })
    .join("");
}

function renderHome() {
  const title = state.data.title;
  return `
    <section class="title-block">
      <h1 class="title-en">${escapeHtml(title.en)}</h1>
      <div class="title-row">
        <p class="title-ar" dir="rtl">${escapeHtml(title.ar)}</p>
        <p class="title-he" dir="rtl">${escapeHtml(title.he)}</p>
      </div>
    </section>
    <ul class="cards"></ul>
  `;
}

function renderArtist(slug) {
  const artist = state.data.artists.find((item) => item.slug === slug);
  if (!artist) return `<p class="empty">${escapeHtml(COPY[state.lang].empty)}</p>`;
  const lang = state.lang;
  const dir = RTL.has(lang) ? "rtl" : "ltr";
  const schools = (artist.schools || [])
    .map(
      (school) => `
        <div class="school">
          <p class="year">${escapeHtml(school.year)}</p>
          <div class="school-copy">
            <p class="school-name">${escapeHtml(field(school.name, lang))}</p>
            <p>${escapeHtml(field(school.department, lang))}</p>
          </div>
        </div>`
    )
    .join("");
  const paragraphs = (artist.body?.[lang] || artist.body?.en || [])
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join("");
  const images = artist.gallery || [];
  const index = Math.min(state.galleryIndex, Math.max(images.length - 1, 0));
  state.galleryIndex = index;
  const figure = images.length
    ? `<figure class="gallery">
        <img src="${escapeHtml(images[index])}" alt="" />
        ${
          images.length > 1
            ? `<button class="gallery-nav prev" type="button" data-dir="-1" aria-label="Previous artwork">&lt;</button>
               <button class="gallery-nav next" type="button" data-dir="1" aria-label="Next artwork">&gt;</button>`
            : ""
        }
      </figure>`
    : "";

  document.title = `${artist.name[lang] || artist.name.en} · CrossBeam`;
  return `
    <article dir="${dir}">
      <h1 class="artist-name ${lang}">${escapeHtml(artist.name[lang])}</h1>
      <div class="portrait-wrap"><img src="${escapeHtml(artist.portrait)}" alt="" /></div>
      <section class="bio"><p>${escapeHtml(field(artist.bio, lang))}</p></section>
      <section class="identity">
        <p class="born">${escapeHtml(field(artist.born, lang))}</p>
        <div>${schools}</div>
      </section>
      <section class="body-text">${paragraphs}</section>
      ${figure}
    </article>
  `;
}

function render() {
  const main = document.querySelector("#main");
  if (!main || !state.data) return;
  const slug = artistSlug();
  document.body.classList.toggle("home", !slug);
  if (!slug) document.title = "CrossBeam";
  renderHeaderStart();
  main.innerHTML = slug ? renderArtist(slug) : renderHome();
  if (!slug) renderList();
  main.querySelectorAll(".gallery-nav").forEach((button) => {
    button.addEventListener("click", () => {
      const artist = state.data.artists.find((item) => item.slug === slug);
      const total = artist?.gallery?.length || 1;
      state.galleryIndex = (state.galleryIndex + Number(button.dataset.dir) + total) % total;
      render();
    });
  });
}

async function boot() {
  document.querySelectorAll(".lang-switch button").forEach((button) => {
    button.addEventListener("click", () => setLang(button.dataset.lang));
  });
  window.addEventListener("popstate", () => {
    state.galleryIndex = 0;
    render();
  });
  document.body.addEventListener("click", (event) => {
    const link = event.target.closest("a.card");
    if (!link) return;
    state.galleryIndex = 0;
  });
  const response = await fetch("./data/artists.json", { cache: "no-cache" });
  state.data = await response.json();
  setLang(preferredLang());
}

boot();
