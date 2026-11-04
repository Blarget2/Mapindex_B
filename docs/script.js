const ELEMENTS = {
  themeToggle: document.querySelector("#theme-toggle"),
  pageScroll: document.querySelector(".page-scroll"),
  list: document.querySelector("#maps"),
  search: document.querySelector("#search"),
  status: document.querySelector("#status")
};

const THEME_STORAGE_KEY = "theme";
const SYSTEM_THEME = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
const DEFAULT_ICON = "default_icon.png";
const LEVEL_METADATA_PATTERN = /(?:^|\/)custom_levels\/[^/]+\/level\.json$/i;
const RAW_REPOSITORY_ROOT = "https://raw.githubusercontent.com/sMaptic/MapIndex/main/";

let maps = [];


// set the theme based on stored preference or system preference
function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  ELEMENTS.themeToggle.querySelector("span").textContent = theme === "dark" ? "☀" : "☾";
  ELEMENTS.themeToggle.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
}

function syncThemeFromStorage() {
  const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  setTheme(storedTheme === "dark" || storedTheme === "light" ? storedTheme : SYSTEM_THEME);
}

syncThemeFromStorage();
window.addEventListener("pageshow", syncThemeFromStorage);


// listen for theme button clicked and toggle theme
ELEMENTS.themeToggle.addEventListener("click", () => {
  const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  setTheme(nextTheme);
});


// update padding based on scrollbar visibility
function updateScrollbarPadding() {
  ELEMENTS.pageScroll.classList.toggle(
    "has-scrollbar",
    ELEMENTS.pageScroll.scrollHeight > ELEMENTS.pageScroll.clientHeight
  );
}


// observer for scrollbar visibility changes to update padding
new ResizeObserver(updateScrollbarPadding).observe(ELEMENTS.pageScroll);


// INDEX FUNCTIONALITY:
// update palette based on current theme and save preference to localStorage
function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  ELEMENTS.themeToggle.querySelector("span").textContent = theme === "dark" ? "☀" : "☾";
  ELEMENTS.themeToggle.setAttribute(
    "aria-label",
    theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
  );
}


// grab the index folder from the github repository and read each subfolder
async function loadGithubMaps() {
  if (!location.hostname.endsWith(".github.io")) return [];

  const owner = location.hostname.slice(0, -".github.io".length);
  const repository = location.pathname.split("/").filter(Boolean)[0] || "";
  if (!repository) return [];

  try {
    const response = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/contents/index`
    );
    if (!response.ok) return [];

    const folders = await response.json();
    const mapPromises = folders
      .filter(folder => folder.type === "dir")
      .map(readGithubFolder);

    return (await Promise.all(mapPromises)).filter(Boolean);
  } catch {
    return [];
  }
}


// read each folder for a downloadable archive and optional icon
async function readGithubFolder(folder) {
  try {
    const response = await fetch(folder.url);
    if (!response.ok) return null;

    const files = await response.json();
    const archive = files.find(file =>
      file.type === "file" && file.name.toLowerCase().endsWith(".zip")
    );
    if (!archive) return null;
    
    const map = {
      name: folder.name,
      file: archive.download_url,
      icon: files.find(file =>
        file.type === "file" && file.name.toLowerCase() === "icon.png"
      )?.download_url || DEFAULT_ICON
    };

    await readLevelMetadata(map);
    return map;

    // catch in event level.json isnt found
  } catch {
    return null;
  }
}


// local fallback that uses a static maps.json. useful for testing how index responds when presented with different metadata
async function loadLocalMaps() {
  try {
    const response = await fetch("maps.json");
    if (!response.ok) return [];

    const locations = await response.json();
    if (!Array.isArray(locations)) return [];

    const localMaps = locations.map(location => {
      const file = typeof location === "string" ? location : location.file;
      if (!file) return null;

      const repositoryPath = file
        .replace(/^(\.\.\/)+/, "")
        .replace(/^\/+/, "");
      const folder = repositoryPath.includes("/")
        ? repositoryPath.slice(0, repositoryPath.lastIndexOf("/"))
        : "";
      const encodedFolder = folder.split("/").filter(Boolean).map(encodeURIComponent).join("/");

      return {
        name: folder.split("/").pop() || file,
        file: `${RAW_REPOSITORY_ROOT}${repositoryPath.split("/").map(encodeURIComponent).join("/")}`,
        icon: encodedFolder
          ? `${RAW_REPOSITORY_ROOT}${encodedFolder}/icon.png`
          : DEFAULT_ICON
      };
    }).filter(Boolean);

    await Promise.all(localMaps.map(readLevelMetadata));
    return localMaps;
  } catch {
    return [];
  }
}


// try to read level.json and fallback to blanks if failure
async function readLevelMetadata(map) {
  if (!window.JSZip) return;

  try {
    const response = await fetch(encodeURI(map.file));
    if (!response.ok) return;

    const archive = await window.JSZip.loadAsync(await response.blob());
    const levelEntry = Object.values(archive.files).find(entry =>
      !entry.dir &&
      entry.name.toLowerCase().replaceAll("\\", "/").match(LEVEL_METADATA_PATTERN)
    );
    if (!levelEntry) return;

    const metadata = JSON.parse(await levelEntry.async("text"));
    map.name = metadata.name || map.name;
    map.id = metadata.id || "";
    map.version = metadata.version || "";
    map.author = Array.isArray(metadata.authors)
      ? metadata.authors.join(", ")
      : metadata.authors || "";
    map.description = metadata.description || "";
  } catch (error) {
    console.warn(`Could not read level metadata for ${map.name}:`, error);
  }
}


// fallback to default icon if map folder doesnt contain an icon
function addIconFallback(image) {
  image.addEventListener("error", () => {
    if (image.dataset.fallbackApplied) return;

    image.dataset.fallbackApplied = "true";
    image.src = DEFAULT_ICON;
  });
}


// create map entry text elements with metadata 
function createMapLabel(map) {
  const label = document.createElement("span");
  label.className = "label";

  const title = document.createElement("span");
  title.className = "map-title";
  title.textContent = map.name;
  label.append(title);

  const details = [
    map.id ? `(${map.id})` : "",
    map.version ? `v${map.version}` : "",
    map.author ? `by ${map.author}` : ""
  ].filter(Boolean).join(" ");

  if (details) {
    const detailText = document.createElement("span");
    detailText.className = "map-details";
    detailText.textContent = ` ${details}`;
    label.append(detailText);
  }

  if (map.description) {
    const description = document.createElement("div");
    description.className = "map-description";
    description.textContent = map.description;
    label.append(description);
  }

  return label;
}


// create card for each map entry with image, metadata, and download link
function createMapRow(map) {
  const row = document.createElement("li");
  row.className = "map-row";

  const image = document.createElement("img");
  image.className = "map-icon";
  image.src = map.icon || DEFAULT_ICON;
  image.alt = "";
  addIconFallback(image);

  const download = document.createElement("a");
  download.className = "map-download";
  download.href = encodeURI(map.file);
  download.download = map.file.split("/").pop();
  download.textContent = "Download";

  row.append(image, createMapLabel(map), download);
  return row;
}


// kill all previous children in the map list, replace with new entries, and update the status text
function renderMapList(entries) {
  ELEMENTS.list.replaceChildren();
  ELEMENTS.status.textContent =
    `Custom maps found: ${entries.length}`;

  const rows = entries.filter(Boolean).map(createMapRow);
  ELEMENTS.list.append(...rows);

  requestAnimationFrame(updateScrollbarPadding);
}


// listener for search input change event, filters and refreshes visible list
ELEMENTS.search.addEventListener("input", () => {
  const matches = maps.filter(map => {
    const searchableText = [
      map.name,
      map.id,
      map.version,
      map.author,
      map.description,
      map.file
    ].filter(Boolean).join(" ").toLowerCase();

    return searchableText.includes(ELEMENTS.search.value.trim().toLowerCase());
  });

  renderMapList(matches);
});


// load maps with github content api first with fallback to maps.json
async function initializeMaps() {
  ELEMENTS.status.textContent = "Loading maps...";
  const githubMaps = await loadGithubMaps();
  maps = githubMaps.length > 0 ? githubMaps : await loadLocalMaps();
  renderMapList(maps);
}

initializeMaps();
