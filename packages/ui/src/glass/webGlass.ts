// Web frosted glass: backdrop-filter blur + saturation, a lens sheen on the upper half and a specular rim
// brightest at the top-left edge. Injected once into <head> so the library needs no host CSS.
// react-native-web turns `dataSet={{ hugoglass: 'light' }}` into the data-hugoglass attribute used here.
const CSS = `
[data-hugoglass]{-webkit-backdrop-filter:blur(28px) saturate(180%);backdrop-filter:blur(28px) saturate(180%);box-shadow:0 8px 28px -6px rgba(0,0,0,.18),0 1px 4px rgba(0,0,0,.06)}
[data-hugoglass][data-hugoclear]{-webkit-backdrop-filter:blur(10px) saturate(200%);backdrop-filter:blur(10px) saturate(200%)}
[data-hugoglass=dark]{box-shadow:0 8px 28px -6px rgba(0,0,0,.6),0 1px 4px rgba(0,0,0,.3)}
[data-hugoglass]::before{content:"";position:absolute;inset:0;z-index:-1;border-radius:inherit;pointer-events:none;background:linear-gradient(180deg,rgba(255,255,255,.38),rgba(255,255,255,0) 48%)}
[data-hugoglass=dark]::before{background:linear-gradient(180deg,rgba(255,255,255,.09),rgba(255,255,255,0) 48%)}
[data-hugoglass]::after{content:"";position:absolute;inset:0;padding:1px;border-radius:inherit;pointer-events:none;background:linear-gradient(150deg,rgba(255,255,255,.95),rgba(255,255,255,.3) 28%,rgba(255,255,255,.1) 55%,rgba(255,255,255,.55));-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude}
[data-hugoglass=dark]::after{background:linear-gradient(150deg,rgba(255,255,255,.42),rgba(255,255,255,.12) 28%,rgba(255,255,255,.04) 55%,rgba(255,255,255,.2))}
@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){[data-hugoglass=light]{background-color:rgba(249,249,249,.96)!important}[data-hugoglass=dark]{background-color:rgba(30,30,32,.96)!important}}
@media (prefers-reduced-transparency:reduce){[data-hugoglass]{-webkit-backdrop-filter:none;backdrop-filter:none}[data-hugoglass=light]{background-color:rgba(249,249,249,.98)!important}[data-hugoglass=dark]{background-color:rgba(30,30,32,.98)!important}}
`;

let injected = false;
export function ensureWebGlass() {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const el = document.createElement('style');
  el.id = 'hugo-music-glass';
  el.textContent = CSS;
  document.head.appendChild(el);
}
