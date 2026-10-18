const menuButton = document.querySelector(".menu-toggle");
const navigation = document.querySelector("#navigation");
function closeMenu() {
  navigation.classList.remove("open");
  menuButton.setAttribute("aria-expanded", "false");
}
menuButton.addEventListener("click", () => {
  const isOpen = navigation.classList.toggle("open");
  menuButton.setAttribute("aria-expanded", String(isOpen));
});
navigation.addEventListener("click", (event) => {
  if (event.target.closest("a, button")) closeMenu();
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".nav-wrap")) closeMenu();
});
const toast = document.querySelector("#toast");
let toastTimer;
function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("visible");
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 3500);
}
const images = Array.from({ length: 31 }, (unused, index) => {
  const number = String(index + 1).padStart(2, "0");
  return {
    src: "assets/gallery/world-" + number + ".webp",
    alt: "MTNetwork 服务器实景 " + (index + 1),
  };
});
const totalImages = String(images.length).padStart(2, "0");
let currentImage = 0;
const heroImage = document.querySelector("#hero-image");
const imageCount = document.querySelector("#image-count");
function imageCounter(index) {
  return String(index + 1).padStart(2, "0") + " / " + totalImages;
}
const heroImageNext = document.querySelector("#hero-image-next");
const carousel = document.querySelector(".hero");
const slideshowButton = document.querySelector("#toggle-slideshow");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let userPaused = reducedMotion.matches;
let carouselVisible = true;
let slideTimer;
let fadeTimer;
let changeRequest = 0;
function updateSlideshowButton() {
  slideshowButton.textContent = userPaused ? "播放" : "暂停";
  slideshowButton.setAttribute(
    "aria-label",
    userPaused ? "播放自动轮播" : "暂停自动轮播",
  );
  slideshowButton.setAttribute("aria-pressed", String(userPaused));
}
function scheduleSlide() {
  clearTimeout(slideTimer);
  if (
    userPaused ||
    document.hidden ||
    !carouselVisible ||
    document.body.dataset.page !== "home"
  )
    return;
  slideTimer = setTimeout(() => changeImage(1), 6000);
}
async function changeImage(direction) {
  clearTimeout(slideTimer);
  const request = ++changeRequest;
  const nextIndex = (currentImage + direction + images.length) % images.length;
  const preload = new Image();
  preload.src = images[nextIndex].src;
  try {
    await preload.decode();
    if (request !== changeRequest) return;
    clearTimeout(fadeTimer);
    heroImageNext.classList.remove("is-visible");
    if (reducedMotion.matches) {
      heroImage.src = images[nextIndex].src;
    } else {
      heroImageNext.src = images[nextIndex].src;
      await heroImageNext.decode();
      if (request !== changeRequest) return;
      heroImageNext.classList.add("is-visible");
    }
    currentImage = nextIndex;
    heroImage.alt = images[currentImage].alt;
    imageCount.textContent = imageCounter(currentImage);
    fadeTimer = setTimeout(() => {
      if (request !== changeRequest) return;
      heroImage.src = images[currentImage].src;
      heroImageNext.classList.remove("is-visible");
    }, 800);
  } catch {
    if (request === changeRequest)
      showToast("图片加载失败，请切换下一张或刷新重试。");
  } finally {
    if (request === changeRequest) scheduleSlide();
  }
}
slideshowButton.addEventListener("click", () => {
  userPaused = !userPaused;
  updateSlideshowButton();
  scheduleSlide();
});
document.addEventListener("visibilitychange", scheduleSlide);
reducedMotion.addEventListener("change", () => {
  userPaused = reducedMotion.matches;
  updateSlideshowButton();
  scheduleSlide();
});
if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(([entry]) => {
    carouselVisible = entry.isIntersecting;
    scheduleSlide();
  });
  observer.observe(carousel);
}
updateSlideshowButton();
scheduleSlide();
imageCount.textContent = imageCounter(currentImage);
document
  .querySelector("#previous-image")
  .addEventListener("click", () => changeImage(-1));
document
  .querySelector("#next-image")
  .addEventListener("click", () => changeImage(1));
heroImage.addEventListener("error", () =>
  showToast("图片加载失败，请切换下一张或刷新重试。"),
);
document.querySelector("#copy-group").addEventListener("click", async () => {
  try {
    if (!navigator.clipboard?.writeText)
      throw new Error("Clipboard unavailable");
    await navigator.clipboard.writeText("1064494318");
    showToast("群号已复制，去 QQ 找到我们吧。");
  } catch {
    showToast("请长按或选中群号复制：1064494318");
  }
});
document.querySelector("#year").textContent = new Date().getFullYear();

const pageViews = [...document.querySelectorAll("[data-view]")];
const homeOnlyElements = [...document.querySelectorAll("[data-home-only]")];
const pageTitles = {
  home: document.title,
  players: "玩家 · MTNetwork",
  rankings: "排行榜 · MTNetwork",
};
let currentPage = "home";
let homeScroll = 0;
let navigationVersion = 0;
let activePageAnimation;
let initializedPage = false;
function pageFromLocation() {
  const page = new URL(location.href).searchParams.get("page");
  if (page === "docs") {
    window.location.replace("https://docs.mcmtn.net/");
    return "home";
  }
  return ["players", "rankings"].includes(page) ? page : "home";
}
function scrollToPage(page, hash, restoreScroll, smooth = false) {
  const target =
    page === "home" && hash ? document.getElementById(hash.slice(1)) : null;
  const headerOffset = document.querySelector(".header").offsetHeight + 20;
  const top = target
    ? target.getBoundingClientRect().top + window.scrollY - headerOffset
    : page === "home" && restoreScroll
      ? homeScroll
      : 0;
  window.scrollTo({
    top: Math.max(0, top),
    behavior: smooth && !reducedMotion.matches ? "smooth" : "instant",
  });
}
async function renderPage(
  page,
  { animate = true, hash = "", restoreScroll = false } = {},
) {
  const version = ++navigationVersion;
  activePageAnimation?.cancel();
  const previousView = document.querySelector(
    '[data-view="' + currentPage + '"]',
  );
  const nextView = document.querySelector('[data-view="' + page + '"]');
  if (page === currentPage && initializedPage) {
    document.querySelector("#main").removeAttribute("aria-busy");
    closeMenu();
    scrollToPage(page, hash, restoreScroll, animate);
    return;
  }
  const shouldAnimate = animate && !reducedMotion.matches;
  document.querySelector("#main").setAttribute("aria-busy", "true");
  if (shouldAnimate) {
    activePageAnimation = previousView.animate(
      [
        { opacity: 1, transform: "translateY(0)" },
        { opacity: 0, transform: "translateY(-10px)" },
      ],
      { duration: 160, easing: "ease-in", fill: "forwards" },
    );
    try {
      await activePageAnimation.finished;
    } catch {
      return;
    }
    if (version !== navigationVersion) return;
    activePageAnimation.cancel();
  }
  pageViews.forEach((view) => {
    view.hidden = view !== nextView;
  });
  homeOnlyElements.forEach((element) => {
    element.hidden = page !== "home";
  });
  currentPage = page;
  initializedPage = true;
  document.body.dataset.page = page;
  document.title = pageTitles[page];
  document.dispatchEvent(new CustomEvent("mtn:page", { detail: { page } }));
  navigation.querySelectorAll("[data-route]").forEach((link) => {
    const selected = link.dataset.route === page;
    link.classList.toggle("nav-active", selected);
    if (selected) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  closeMenu();
  scrollToPage(page, hash, restoreScroll);
  if (animate) nextView.querySelector("h1")?.focus({ preventScroll: true });
  scheduleSlide();
  document.querySelector("#main").removeAttribute("aria-busy");
  if (shouldAnimate) {
    activePageAnimation = nextView.animate(
      [
        { opacity: 0, transform: "translateY(14px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      { duration: 260, easing: "cubic-bezier(.2,.7,.2,1)" },
    );
    try {
      await activePageAnimation.finished;
    } catch {
      return;
    }
    if (version === navigationVersion) activePageAnimation = null;
  }
}
function navigateToPage(page, hash = "") {
  if (currentPage === "home") homeScroll = window.scrollY;
  const url = new URL(location.href);
  if (page === "home") url.searchParams.delete("page");
  else url.searchParams.set("page", page);
  url.searchParams.delete("player");
  url.hash = hash;
  if (url.href !== location.href) history.pushState({ page }, "", url);
  renderPage(page, { hash });
}
document.addEventListener("click", (event) => {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  const routeLink = event.target.closest("a[data-route]");
  if (routeLink) {
    event.preventDefault();
    navigateToPage(routeLink.dataset.route);
    return;
  }
  const homeAnchor = event.target.closest('a[href^="#"]');
  if (homeAnchor) {
    event.preventDefault();
    navigateToPage("home", homeAnchor.getAttribute("href"));
  }
});
window.addEventListener("popstate", () => {
  const page = pageFromLocation();
  if (currentPage === "home" && page !== "home") homeScroll = window.scrollY;
  renderPage(page, { hash: location.hash, restoreScroll: true });
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeMenu();
});
history.scrollRestoration = "manual";
renderPage(pageFromLocation(), { animate: false, hash: location.hash });
