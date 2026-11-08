const LANGS = ["en", "ar", "he"];
const RTL = new Set(["he", "ar"]);
const STORAGE_KEY = "cb-lang";

const COPY = {
  en: { search: "Search artists", empty: "No artists match.", back: "All artists", previous: "Previous artist", next: "Next artist" },
  he: { search: "חיפוש אמנים", empty: "לא נמצאו אמנים.", back: "כל האמנים", previous: "האמן הקודם", next: "האמן הבא" },
  ar: { search: "البحث عن الفنانين", empty: "لا يوجد فنانون.", back: "كل الفنانين", previous: "الفنان السابق", next: "الفنان التالي" },
};

const CREDITS = {
  en: [
    "Curators: Ilanit Konopny and Abraham Kritzman",
    "Associate Curator: Mina Reingold",
    "Producer: Suhaila Abu Hadba Mounayer",
    "Concept and Graphic Design: Yuval Nae and Efrat Shmuely",
    "Exhibition Design Consultation: Alexandra Topaz and Ali Ben-Arieh",
    "Interviews, Content Editing, and Production: Yuval Keshet",
    "Portrait Photography: Ariel Hacohen",
    "English Translation: Yuval Keshet",
    "Hebrew Copy-Editing: Ronit Rosenthal",
    "Arabic Translation: Jenan Bassoul and Dr. Ruba Samaan",
  ],
  he: [
    "אוצרים: אילנית קונופני ואברהם קריצמן",
    "אוצרת משנה: מינה ריינגולד",
    "מפיקה: סוהיילה אבו הדבה מונייר",
    "קונספט ועיצוב גרפי: יובל נאה ואפרת שמואלי",
    "ליווי עיצוב חלל: אלכסנדרה טופז ועלי בן אריה",
    "ראיונות, עריכת תוכן והפקה: יובל קשת",
    "צילום דיוקנאות: אריאל הכהן",
    "תרגום לאנגלית: יובל קשת",
    "עריכת לשון עברית: רונית רוזנטל",
    "תרגום לערבית: ז'נאן בסול, ד״ר רובא סמעאן",
  ],
  ar: [
    "القيّمان: إيلانيت كونوبوني وأبرهام كريتسمان",
    "نائبة القيّمين: مينا رينغولد",
    "تنفيذ: سهيلة أبو هدبة منيّر",
    "الفكرة وتصميم الجرافيك: يوفال نائية وإفرات شموئيلي",
    "مرافقة تصميم الحيّز: ألكساندرا طوباز وعِيلي بن أرييه",
    "المقابلات، تحرير المحتوى والإنتاج: يوفال كيشت",
    "تصوير البورتريهات: أريئيل هكوهن",
    "ترجمة للإنجليزيّة: يوفال كيشت",
    "تحرير لغويّ للنسخة العبريّة: رونيت روزنطال",
    "ترجمة للعربيّة: جنان بصول، د. ربى سمعان",
  ],
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
const chevron = (direction) => {
  const path = direction === "left" ? "M14.5 5 L8 12 L14.5 19" : "M9.5 5 L16 12 L9.5 19";
  return `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="${path}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="miter"/></svg>`;
};

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

function familyName(artist, lang) {
  const name = (artist.name?.[lang] || artist.name?.en || "").trim();
  const parts = name.split(/\s+/).filter(Boolean);
  let family = parts.at(-1) || name;
  if (lang === "ar") family = family.replace(/^(?:ال|أل|إل)/, "");
  return family;
}

function orderedArtists() {
  const lang = state.lang;
  const compare = new Intl.Collator(lang, { sensitivity: "base", numeric: true }).compare;
  return [...state.data.artists].sort((a, b) => compare(familyName(a, lang), familyName(b, lang)));
}

function visibleArtists() {
  const query = state.query.trim();
  return orderedArtists().filter((artist) => matches(artist, query));
}

function artistNeighbors(slug) {
  const artists = orderedArtists();
  const index = artists.findIndex((artist) => artist.slug === slug);
  if (index < 0 || artists.length < 2) return { prev: null, next: null };
  return {
    prev: artists[(index - 1 + artists.length) % artists.length],
    next: artists[(index + 1) % artists.length],
  };
}

function renderHeaderStart() {
  const slot = document.querySelector("#header-start");
  const slug = artistSlug();
  if (slug) {
    slot.innerHTML = `<a class="icon-button back-button" href="./" aria-label="${escapeHtml(COPY[state.lang].back)}">${chevron("left")}</a>`;
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
  const artists = visibleArtists();
  if (!artists.length) {
    list.innerHTML = `<li><p class="empty">${escapeHtml(COPY[state.lang].empty)}</p></li>`;
    return;
  }
  list.innerHTML = artists
    .map((artist) => {
      const names = nameOrder(state.lang)
        .map((lang) => `<p class="${lang}">${escapeHtml(artist.name[lang])}</p>`)
        .join("");
      const card = artist.portrait.replace(/portrait\.jpg$/, "card.jpg");
      return `<li><a class="card" href="./?artist=${encodeURIComponent(artist.slug)}"><span class="card-main"><span class="card-photo"><img src="${escapeHtml(card)}" alt="" /></span><span class="names">${names}</span></span>${arrowIcon}</a></li>`;
    })
    .join("");
}

function renderHome() {
  const title = state.data.title;
  return `
    <section class="title-block" dir="ltr">
      <div class="title-lockup">
        <h1 class="title-en"><img class="title-logo" src="assets/brand/crossbeam.svg" width="804" height="107" alt="${escapeHtml(title.en)}" /></h1>
        <div class="title-row">
          <p class="title-ar" dir="rtl">${escapeHtml(title.ar)}</p>
          <p class="title-he" dir="rtl">${escapeHtml(title.he)}</p>
        </div>
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
          <p class="school-name">${escapeHtml(field(school.name, lang))}</p>
          <p class="school-dept">${escapeHtml(field(school.department, lang))}</p>
        </div>`
    )
    .join("");
  const paragraphs = (artist.body?.[lang] || artist.body?.en || [])
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join("");
  const images = artist.gallery || [];
  state.galleryIndex = Math.min(state.galleryIndex, Math.max(images.length - 1, 0));
  const slides = images
    .map((src) => `<img src="${escapeHtml(src)}" alt="" draggable="false" />`)
    .join("");
  const figure = images.length
    ? `<figure class="gallery" dir="ltr">
        ${images.length > 1 ? `<button class="gallery-nav prev" type="button" aria-label="Previous artwork">${chevron("left")}</button>` : ""}
        <div class="gallery-viewport">
          <div class="gallery-track">${slides}</div>
        </div>
        ${images.length > 1 ? `<button class="gallery-nav next" type="button" aria-label="Next artwork">${chevron("right")}</button>` : ""}
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
      ${renderArtistPager(slug, lang)}
    </article>
  `;
}

function renderArtistPager(slug, lang) {
  const { prev, next } = artistNeighbors(slug);
  if (!prev || !next) return "";
  const link = (artist, direction) => {
    const name = artist.name[lang] || artist.name.en;
    const label = `${COPY[lang][direction]}: ${name}`;
    const icon = chevron(direction === "previous" ? "left" : "right");
    const text = `<span dir="${RTL.has(lang) ? "rtl" : "ltr"}">${escapeHtml(name)}</span>`;
    const inner = direction === "previous" ? `${icon}${text}` : `${text}${icon}`;
    return `<a class="pager-link ${direction}" href="./?artist=${encodeURIComponent(artist.slug)}" aria-label="${escapeHtml(label)}">${inner}</a>`;
  };
  return `<nav class="artist-pager" dir="ltr" aria-label="Artists">${link(prev, "previous")}${link(next, "next")}</nav>`;
}

function renderFooter() {
  const footer = document.querySelector("#site-footer");
  if (!footer) return;
  const rtl = RTL.has(state.lang);
  footer.lang = state.lang;
  footer.dir = rtl ? "rtl" : "ltr";
  footer.textContent = CREDITS[state.lang].join(" · ");
}

function render() {
  const main = document.querySelector("#main");
  if (!main || !state.data) return;
  const slug = artistSlug();
  document.body.classList.toggle("home", !slug);
  document.documentElement.dir = "ltr";
  main.dir = RTL.has(state.lang) ? "rtl" : "ltr";
  if (!slug) document.title = "CrossBeam";
  renderHeaderStart();
  renderFooter();
  main.innerHTML = slug ? renderArtist(slug) : renderHome();
  if (!slug) renderList();
  bindGallery(main.querySelector(".gallery"));
}

let galleryObserver = null;

function bindGallery(root) {
  galleryObserver?.disconnect();
  galleryObserver = null;
  if (!root) return;
  const viewport = root.querySelector(".gallery-viewport");
  const track = root.querySelector(".gallery-track");
  const slides = track ? [...track.children] : [];
  const count = slides.length;
  if (!viewport || !track || count < 2) return;

  const lastClone = slides[count - 1].cloneNode(true);
  const firstClone = slides[0].cloneNode(true);
  lastClone.setAttribute("aria-hidden", "true");
  firstClone.setAttribute("aria-hidden", "true");
  track.insertBefore(lastClone, slides[0]);
  track.appendChild(firstClone);

  let position = state.galleryIndex + 1;
  let drag = null;

  const place = (animate) => {
    track.style.transition = animate ? "transform 420ms cubic-bezier(.22,.8,.3,1)" : "none";
    const width = viewport.clientWidth;
    const offset = drag?.dx || 0;
    track.style.transform = `translate3d(${-position * width + offset}px,0,0)`;
    const tallest = Math.round(
      Math.max(0, ...[...track.children].map((img) => img.getBoundingClientRect().height))
    );
    if (tallest > 0 && Math.round(viewport.getBoundingClientRect().height) !== tallest) {
      viewport.style.height = `${tallest}px`;
    }
  };

  const remember = () => {
    state.galleryIndex = ((position - 1) % count + count) % count;
  };

  const settle = () => {
    if (position !== 0 && position !== count + 1) return;
    position = position === 0 ? count : 1;
    remember();
    place(false);
  };

  const go = (direction) => {
    if (position === 0 || position === count + 1) settle();
    position += direction;
    drag = null;
    remember();
    place(true);
  };

  root.querySelector(".prev")?.addEventListener("click", () => go(-1));
  root.querySelector(".next")?.addEventListener("click", () => go(1));
  track.addEventListener("transitionend", (event) => {
    if (event.target !== track || event.propertyName !== "transform") return;
    settle();
  });

  viewport.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    if (position === 0 || position === count + 1) settle();
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, axis: "" };
  });
  viewport.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.axis) {
      if (Math.hypot(dx, dy) < 8) return;
      drag.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (drag.axis === "x") viewport.setPointerCapture(event.pointerId);
    }
    if (drag.axis !== "x") return;
    drag.dx = dx;
    place(false);
  });
  const finish = (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = drag.axis === "x" ? drag.dx : 0;
    drag = null;
    if (dx < -48) position += 1;
    else if (dx > 48) position -= 1;
    position = Math.max(0, Math.min(count + 1, position));
    remember();
    place(true);
  };
  viewport.addEventListener("pointerup", finish);
  viewport.addEventListener("pointercancel", finish);
  track.querySelectorAll("img").forEach((img) => {
    if (!img.complete) img.addEventListener("load", () => place(false), { once: true });
  });
  galleryObserver = new ResizeObserver(() => place(false));
  galleryObserver.observe(viewport);
  place(false);
}

function openPage(url) {
  history.pushState({}, "", url);
  state.galleryIndex = 0;
  render();
  if (artistSlug()) window.scrollTo(0, 0);
}

async function boot() {
  document.querySelectorAll(".lang-switch button").forEach((button) => {
    button.addEventListener("click", () => setLang(button.dataset.lang));
  });
  window.addEventListener("popstate", () => {
    state.galleryIndex = 0;
    render();
    if (artistSlug()) window.scrollTo(0, 0);
  });
  document.body.addEventListener("click", (event) => {
    const link = event.target.closest("a.card, a.back-button, a.pager-link");
    if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    openPage(link.getAttribute("href"));
  });
  const response = await fetch("./data/artists.json", { cache: "no-cache" });
  state.data = await response.json();
  setLang(preferredLang());
}

boot();
