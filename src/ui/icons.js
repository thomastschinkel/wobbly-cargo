// Inline SVG icons (no image requests). White fill + dark outline to match the art style.
const OL = '#2a1f3d';
const wrap = (inner, vb = '0 0 24 24') => `<svg viewBox="${vb}" aria-hidden="true">${inner}</svg>`;
const S = `stroke="${OL}" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"`;

export const ICON = {
  pause: wrap(`<rect x="5" y="4" width="5" height="16" rx="1.6" fill="#fff" ${S}/><rect x="14" y="4" width="5" height="16" rx="1.6" fill="#fff" ${S}/>`),
  retry: wrap(`<path d="M19.5 12a7.5 7.5 0 1 1-2.6-5.7" fill="none" stroke="${OL}" stroke-width="5.2" stroke-linecap="round"/><path d="M19.5 12a7.5 7.5 0 1 1-2.6-5.7" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><path d="M14.2 3.6l5.6.4-1.2 5.4z" fill="#fff" ${S}/>`),
  play: wrap(`<path d="M7 4.5l12 7.5-12 7.5z" fill="#fff" ${S}/>`),
  next: wrap(`<path d="M4 9h8V4.5L20 12l-8 7.5V15H4z" fill="#fff" ${S}/>`),
  back: wrap(`<path d="M20 9h-8V4.5L4 12l8 7.5V15h8z" fill="#fff" ${S}/>`),
  home: wrap(`<path d="M3.5 11.5L12 4l8.5 7.5M6 10v9.5h4.5V15h3v4.5H18V10" fill="#fff" ${S}/>`),
  gear: wrap(`<path d="M12 2.8l1.6 2.3 2.7-.7.7 2.7 2.6 1-.6 2.7 1.9 2-1.9 2 .6 2.7-2.6 1-.7 2.7-2.7-.7L12 21.2l-1.6-2.3-2.7.7-.7-2.7-2.6-1 .6-2.7-1.9-2 1.9-2-.6-2.7 2.6-1 .7-2.7 2.7.7z" fill="#fff" ${S}/><circle cx="12" cy="12" r="3.2" fill="#8f6dd9" ${S}/>`),
  lock: wrap(`<path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="${OL}" stroke-width="4"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="#fff" stroke-width="1.8"/><rect x="5" y="10.5" width="14" height="10" rx="2.2" fill="#fff" ${S}/><circle cx="12" cy="15.5" r="1.5" fill="${OL}"/>`),
  star: (on = true) => wrap(`<path d="M12 2.4l2.95 6.05 6.65.8-4.9 4.55 1.3 6.6L12 17.2l-6 3.2 1.3-6.6-4.9-4.55 6.65-.8z" fill="${on ? '#ffd23f' : '#ddd6e8'}" stroke="${OL}" stroke-width="1.8" stroke-linejoin="round"/>${on ? '<path d="M9.2 8.7l2.1-.3" stroke="#fff6c9" stroke-width="1.6" stroke-linecap="round"/>' : ''}`),
  truck: wrap(`<path d="M2.5 7h11v9h-11z" fill="#fff" ${S}/><path d="M13.5 10h4l3 3.2V16h-7z" fill="#fff" ${S}/><circle cx="7" cy="17.2" r="2.2" fill="#fff" ${S}/><circle cx="17" cy="17.2" r="2.2" fill="#fff" ${S}/>`),
  map: wrap(`<rect x="3.5" y="3.5" width="7" height="7" rx="1.6" fill="#fff" ${S}/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6" fill="#fff" ${S}/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6" fill="#fff" ${S}/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6" fill="#ffd23f" ${S}/>`),
  calendar: wrap(`<rect x="3.5" y="5" width="17" height="15.5" rx="2.4" fill="#fff" ${S}/><path d="M3.5 10h17" ${S}/><path d="M8 3v4M16 3v4" ${S}/><path d="M12 12.2l1.1 2.2 2.4.3-1.8 1.6.5 2.4-2.2-1.2-2.2 1.2.5-2.4-1.8-1.6 2.4-.3z" fill="#ffd23f" stroke="${OL}" stroke-width="1.1" stroke-linejoin="round"/>`),
  video: wrap(`<rect x="2.5" y="6" width="13" height="12" rx="2.2" fill="#fff" ${S}/><path d="M15.5 10.5l5-3v9l-5-3z" fill="#fff" ${S}/>`),
  skip: wrap(`<path d="M3.5 5.5l8 6.5-8 6.5zM12 5.5l8 6.5-8 6.5z" fill="#fff" ${S}/>`),
  gift: wrap(`<rect x="3.5" y="9" width="17" height="11.5" rx="1.6" fill="#ff5ea8" ${S}/><rect x="2.5" y="6.5" width="19" height="4" rx="1.2" fill="#fff" ${S}/><path d="M12 6.5v14" stroke="#ffd23f" stroke-width="3"/><path d="M12 6.5c-2-4-6.5-3-4.5-.2M12 6.5c2-4 6.5-3 4.5-.2" fill="none" ${S}/>`),
  sound: wrap(`<path d="M3.5 9.5h4l5-4.5v14l-5-4.5h-4z" fill="#fff" ${S}/><path d="M16 9c1.3 1.6 1.3 4.4 0 6M18.5 6.5c2.8 3.2 2.8 7.8 0 11" fill="none" ${S}/>`),
  flag: wrap(`<path d="M5 21V3.5" stroke="${OL}" stroke-width="2.4" stroke-linecap="round"/><path d="M5.5 4h13l-2.6 4 2.6 4h-13z" fill="#fff" ${S}/><path d="M9 4v8M13 4v8" stroke="${OL}" stroke-width="1" opacity="0.5"/>`),
  fire: wrap(`<path d="M12 21c-4.2 0-7-2.8-7-6.6 0-3.6 3-5.4 3.6-9.4 2 1.2 3 3 3.1 5 1-1.2 1.6-2.6 1.5-4.3 3.3 2 5.8 5.5 5.8 8.9 0 3.7-2.8 6.4-7 6.4z" fill="#ff8a3d" ${S}/><path d="M12 20c-1.9 0-3.1-1.2-3.1-2.9 0-1.6 1.4-2.5 1.8-4.2 1.9 1 3 2.2 3 3.6.4-.5.7-1 .8-1.7 1 .8 1.6 1.7 1.6 2.4 0 1.7-1.6 2.8-4.1 2.8z" fill="#ffd23f"/>`),
  gas: wrap(`<path d="M6 4l7 8-7 8M12 4l7 8-7 8" fill="none" stroke="${OL}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 4l7 8-7 8M12 4l7 8-7 8" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`),
  brake: wrap(`<path d="M18 4l-7 8 7 8" fill="none" stroke="${OL}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M18 4l-7 8 7 8" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><rect x="4" y="4" width="4" height="16" rx="1.4" fill="#fff" ${S}/>`),
  phone: wrap(`<rect x="7" y="2.5" width="10" height="19" rx="2.2" fill="#fff" ${S}/><path d="M10.5 18.5h3" ${S}/>`),
  check: wrap(`<path d="M4.5 12.5l4.5 4.5 10-10" fill="none" stroke="${OL}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M4.5 12.5l4.5 4.5 10-10" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`),
  cross: wrap(`<path d="M6 6l12 12M18 6L6 18" fill="none" stroke="${OL}" stroke-width="5" stroke-linecap="round"/><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>`),
  trophy: wrap(`<path d="M7 4h10v5a5 5 0 0 1-10 0z" fill="#ffd23f" ${S}/><path d="M7 6H4.5a3 3 0 0 0 3 4.5M17 6h2.5a3 3 0 0 1-3 4.5" fill="none" ${S}/><path d="M12 14v3M8 20.5h8l-1-3.5H9z" fill="#ffd23f" ${S}/>`),
};
